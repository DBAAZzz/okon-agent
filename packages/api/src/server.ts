import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createLogger } from '@okon/shared';
import rulesEnginePlugin from '@okon/rule';
import type { EvaluateAllRulesResult } from '@okon/rule';
import { ZodError } from 'zod';
import {
  createIntakeSchema,
  matchDirectSchema,
  partialUserFactsSchema,
  type PartialUserFacts,
  type UserFacts,
  updateIntakeSchema
} from './schemas.js';
import { extractTextFromPdfBuffer, looksLikePdf } from './pdf/extract.js';
import { getIntake, listIntakes, saveIntake, type IntakeRecord } from './store.js';

const logger = createLogger('api-server');
const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultRulesDir = join(currentDir, '../../rule/rules');
const defaultMaxPdfSizeBytes = Number(process.env.MAX_PDF_SIZE_BYTES ?? 10 * 1024 * 1024);
const defaultMaxExtractChars = Number(process.env.MAX_PDF_EXTRACT_CHARS ?? 50000);

function emptyFacts(): UserFacts {
  return {
    credit: {},
    profile: {},
    business: {}
  };
}

function mergeFacts(base: UserFacts, patch: PartialUserFacts): UserFacts {
  return {
    credit: { ...base.credit, ...(patch.credit ?? {}) },
    profile: { ...base.profile, ...(patch.profile ?? {}) },
    business: { ...base.business, ...(patch.business ?? {}) }
  };
}

function serializeRecord(record: IntakeRecord) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    facts: record.facts,
    meta: record.meta,
    lastMatch: record.lastMatch
  };
}

function toMatchView(result: EvaluateAllRulesResult) {
  return {
    hit: result.hit,
    totalRules: result.totalRules,
    elapsedMs: result.elapsedMs,
    matches: result.matches.map((match) => {
      const product = match.outcome.payload?.product;
      return {
        ruleId: match.ruleId,
        priority: match.priority,
        action: match.outcome.action,
        reasonCodes: match.outcome.reasonCodes ?? [],
        evaluationMs: match.evaluationMs,
        product
      };
    })
  };
}

const app = Fastify({
  logger: false
});

await app.register(cors, {
  origin: true,
  credentials: true
});

await app.register(multipart, {
  attachFieldsToBody: false,
  throwFileSizeLimit: true,
  limits: {
    files: 1,
    fileSize: defaultMaxPdfSizeBytes
  }
});

await app.register(rulesEnginePlugin, {
  rulesDir: process.env.RULES_DIR || defaultRulesDir,
  watch: true
});

app.setErrorHandler((error, _request, reply) => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: string }).code;

    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      reply.status(413).send({
        error: 'PDF_FILE_TOO_LARGE',
        message: `PDF 文件过大，最大支持 ${defaultMaxPdfSizeBytes} bytes`
      });
      return;
    }

    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
      reply.status(400).send({
        error: 'INVALID_MULTIPART',
        message: '请使用 multipart/form-data 上传 PDF 文件'
      });
      return;
    }
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      error: 'INVALID_INPUT',
      details: error.issues
    });
    return;
  }

  logger.error('API 错误', error);
  reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Unknown error'
  });
});

app.post('/api/files/pdf/extract-text', async (request, reply) => {
  const maxCharsRaw = Number((request.query as { maxChars?: string }).maxChars ?? defaultMaxExtractChars);
  const maxChars = Number.isFinite(maxCharsRaw)
    ? Math.min(Math.max(Math.floor(maxCharsRaw), 1000), 200000)
    : defaultMaxExtractChars;

  const filePart = await request.file();
  if (!filePart) {
    reply.status(400);
    return {
      error: 'PDF_FILE_REQUIRED',
      message: '请通过 multipart/form-data 上传 file 字段'
    };
  }

  if (filePart.fieldname !== 'file') {
    reply.status(400);
    return {
      error: 'INVALID_FILE_FIELD',
      message: '上传字段名必须是 file'
    };
  }

  const mimeType = filePart.mimetype?.toLowerCase() ?? '';
  const fileName = filePart.filename ?? 'unknown.pdf';

  const allowedMimeTypes = new Set(['application/pdf', 'application/x-pdf', 'application/octet-stream']);
  if (!allowedMimeTypes.has(mimeType)) {
    reply.status(400);
    return {
      error: 'UNSUPPORTED_FILE_TYPE',
      message: '仅支持上传 PDF 文件',
      fileName,
      mimeType
    };
  }

  const fileBuffer = await filePart.toBuffer();
  if (!looksLikePdf(fileBuffer)) {
    reply.status(400);
    return {
      error: 'INVALID_PDF_FILE',
      message: '文件内容不是合法的 PDF'
    };
  }

  try {
    const extracted = await extractTextFromPdfBuffer(fileBuffer);
    const isTruncated = extracted.text.length > maxChars;
    const text = isTruncated ? extracted.text.slice(0, maxChars) : extracted.text;

    return {
      fileName,
      mimeType,
      sizeBytes: fileBuffer.byteLength,
      pageCount: extracted.pageCount,
      text,
      textLength: extracted.textLength,
      returnedLength: text.length,
      isTruncated,
      extractedAt: new Date().toISOString()
    };
  } catch (error) {
    logger.error('PDF 文本提取失败', error);
    reply.status(422);
    return {
      error: 'PDF_EXTRACT_FAILED',
      message: 'PDF 文本提取失败，请检查文件是否损坏或受保护'
    };
  }
});

app.get('/health', async () => ({
  status: 'ok',
  rules: app.rulesEngine.listRules().length,
  intakes: listIntakes().length
}));

app.get('/api/products', async () => {
  return {
    products: app.rulesEngine.listRules()
  };
});

app.post('/api/intakes', async (request, reply) => {
  const input = createIntakeSchema.parse(request.body ?? {});
  const intakeId = randomUUID();
  const now = new Date().toISOString();

  const record: IntakeRecord = {
    id: intakeId,
    createdAt: now,
    updatedAt: now,
    facts: mergeFacts(emptyFacts(), input.facts),
    meta: input.meta
  };

  saveIntake(record);
  reply.status(201);
  return { intake: serializeRecord(record) };
});

app.get('/api/intakes', async () => {
  return {
    intakes: listIntakes().map(serializeRecord)
  };
});

app.get('/api/intakes/:intakeId', async (request, reply) => {
  const { intakeId } = request.params as { intakeId: string };
  const record = getIntake(intakeId);
  if (!record) {
    reply.status(404);
    return { error: 'INTAKE_NOT_FOUND', intakeId };
  }

  return { intake: serializeRecord(record) };
});

app.patch('/api/intakes/:intakeId', async (request, reply) => {
  const { intakeId } = request.params as { intakeId: string };
  const input = updateIntakeSchema.parse(request.body ?? {});
  const record = getIntake(intakeId);

  if (!record) {
    reply.status(404);
    return { error: 'INTAKE_NOT_FOUND', intakeId };
  }

  const nextRecord: IntakeRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
    facts: mergeFacts(record.facts, input.facts),
    meta: input.meta ?? record.meta
  };

  saveIntake(nextRecord);
  return { intake: serializeRecord(nextRecord) };
});

app.post('/api/intakes/:intakeId/match', async (request, reply) => {
  const { intakeId } = request.params as { intakeId: string };
  const record = getIntake(intakeId);

  if (!record) {
    reply.status(404);
    return { error: 'INTAKE_NOT_FOUND', intakeId };
  }

  const result = await app.rulesEngine.evaluateAll(record.facts);
  const nextRecord: IntakeRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
    lastMatch: result
  };
  saveIntake(nextRecord);

  return {
    intakeId,
    match: toMatchView(result)
  };
});

app.post('/api/match', async (request) => {
  const input = matchDirectSchema.parse(request.body ?? {});
  const result = await app.rulesEngine.evaluateAll(input.facts);
  return {
    match: toMatchView(result)
  };
});

app.post('/api/validate-facts', async (request) => {
  const input = partialUserFactsSchema.parse(request.body ?? {});
  return {
    ok: true,
    normalizedFacts: mergeFacts(emptyFacts(), input)
  };
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  logger.info('API 服务启动成功', { host: HOST, port: PORT });
  console.log(`API server running at http://localhost:${PORT}`);
} catch (error) {
  logger.error('API 服务启动失败', error);
  process.exit(1);
}
