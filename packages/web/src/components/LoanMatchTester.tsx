'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import styles from './LoanMatchTester.module.css';

type CreditFacts = {
  queryCount1M?: number;
  queryCount2M?: number;
  queryCount3M?: number;
  queryCount6M?: number;
  currentOverdue?: boolean;
  creditUsage?: number;
  creditCards?: number;
  unsettledCreditLoans?: number;
  institutions?: number;
  nonBankInstitutions?: number;
  outstandingMicroLoan?: boolean;
  totalCreditLimitWan?: number;
};

type ProfileFacts = {
  identity?: string;
  gender?: 'male' | 'female';
  education?: string;
  age?: number;
  city?: string;
  mainlandHukou?: boolean;
  qualifiedEmployer?: boolean;
  monthlyIncome?: number;
  hasProperty?: boolean;
  hasCar?: boolean;
  hasGJJ?: boolean;
  gjjBase?: number;
  gjjMonths?: number;
  hasShebao?: boolean;
  shebaoBase?: number;
  shebaoMonths?: number;
};

type BusinessFacts = {
  hasBizLicense?: boolean;
  bizAgeMonths?: number;
};

type UserFacts = {
  credit: CreditFacts;
  profile: ProfileFacts;
  business: BusinessFacts;
};

type MatchItem = {
  ruleId: string;
  priority: number;
  action: string;
  reasonCodes: string[];
  evaluationMs: number;
  product?: {
    id: string;
    name: string;
    institution: string;
    amountRange: [number, number];
    termRange: [number, number];
    rateRange: [number, number];
    repaymentMethods: string[];
  };
};

type MatchView = {
  hit: boolean;
  totalRules: number;
  elapsedMs: number;
  matches: MatchItem[];
};

type PdfExtractResponse = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  text: string;
  textLength: number;
  returnedLength: number;
  isTruncated: boolean;
  extractedAt: string;
};

type QueryRecord = {
  queryDate: string;
  institution: string;
  queryReason?: string;
  queryResult?: string;
};

type LoanRecord = {
  accountId?: string;
  institution: string;
  loanCategory: '房贷' | '车贷' | '信用贷' | '经营贷' | '消费贷' | '小额贷款' | '其他';
  isBank?: boolean | null;
  accountStatus: '正常' | '逾期' | '结清' | '呆账' | '未知';
  creditLimit?: number | null;
  originalPrincipal?: number | null;
  currentBalance?: number | null;
  currentOverdueAmount?: number | null;
  monthsOverdue?: number | null;
};

type CreditCardRecord = {
  accountId?: string;
  institution: string;
  cardType?: string;
  isBank?: boolean | null;
  accountStatus: '正常' | '逾期' | '结清' | '呆账' | '未知';
  creditLimit?: number | null;
  usedAmount?: number | null;
  currentOverdueAmount?: number | null;
  minimumPayment?: number | null;
};

type StructuredPdfExtractResponse = {
  reportDate: string | null;
  sourceTruncated: boolean;
  queryRecords: QueryRecord[];
  loanRecords: LoanRecord[];
  creditCardRecords: CreditCardRecord[];
  factsPatch: {
    credit: CreditFacts;
  };
  warnings: string[];
};

type StructuredPdfPartialUpdate = {
  reportDate: string | null;
  sourceTruncated: boolean;
  queryRecordsCount: number;
  loanRecordsCount: number;
  creditCardRecordsCount: number;
  factsPatch: {
    credit: CreditFacts;
  };
  warnings: string[];
};

type StructuredPdfSseEvent =
  | { type: 'start' }
  | { type: 'status'; data: string }
  | { type: 'partial'; data: StructuredPdfPartialUpdate }
  | { type: 'result'; data: StructuredPdfExtractResponse }
  | { type: 'done' }
  | { type: 'error'; data: string };

function createEmptyFacts(): UserFacts {
  return {
    credit: {},
    profile: {},
    business: {}
  };
}

function parseErrorPayload(data: unknown, status: number): string {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string') {
      return `请求失败(${status}): ${message}`;
    }
  }

  if (typeof data === 'object' && data !== null && 'error' in data) {
    const code = (data as { error?: unknown }).error;
    if (typeof code === 'string') {
      return `请求失败(${status}): ${code}`;
    }
  }

  return `请求失败(${status})`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(parseErrorPayload(data, response.status));
  }

  return data as T;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function parseSseDataChunk(chunk: string): string | null {
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join('\n');
}

function formatPdfStreamStatus(status: string): string {
  const map: Record<string, string> = {
    llm_stream_started: 'LLM 流式抽取开始',
    llm_stream_fallback: '流式结果不完整，转降级补抽',
    post_processing: '正在计算规则匹配字段',
    done: '处理完成'
  };

  return map[status] ?? status;
}

export function LoanMatchTester() {
  const defaultApiBase = useMemo(() => process.env.NEXT_PUBLIC_LOAN_API_BASE ?? 'http://localhost:3002', []);
  const defaultAgentApiBase = useMemo(
    () => process.env.NEXT_PUBLIC_AGENT_API_BASE ?? 'http://localhost:3001',
    []
  );
  const [apiBase, setApiBase] = useState(defaultApiBase);
  const [facts, setFacts] = useState<UserFacts>(() => createEmptyFacts());
  const [loading, setLoading] = useState<'direct' | 'intake' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchView | null>(null);
  const [lastIntakeId, setLastIntakeId] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string>('');

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<PdfExtractResponse | null>(null);
  const [pdfStructuredResult, setPdfStructuredResult] = useState<StructuredPdfExtractResponse | null>(null);
  const [pdfStreamStatus, setPdfStreamStatus] = useState<string | null>(null);

  const updateCredit = <K extends keyof CreditFacts>(key: K, value: CreditFacts[K]) => {
    setFacts((prev) => ({ ...prev, credit: { ...prev.credit, [key]: value } }));
  };

  const updateProfile = <K extends keyof ProfileFacts>(key: K, value: ProfileFacts[K]) => {
    setFacts((prev) => ({ ...prev, profile: { ...prev.profile, [key]: value } }));
  };

  const updateBusiness = <K extends keyof BusinessFacts>(key: K, value: BusinessFacts[K]) => {
    setFacts((prev) => ({ ...prev, business: { ...prev.business, [key]: value } }));
  };

  const clearFactForm = () => {
    setFacts(createEmptyFacts());
    setError(null);
    setMatch(null);
    setLastIntakeId(null);
    setRawResponse('');
    setPdfStreamStatus(null);
  };

  const runDirectMatch = async () => {
    setLoading('direct');
    setError(null);
    setLastIntakeId(null);

    try {
      const response = await requestJson<{ match: MatchView }>(`${apiBase}/api/match`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facts })
      });

      setMatch(response.match);
      setRawResponse(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
      setMatch(null);
      setRawResponse('');
    } finally {
      setLoading(null);
    }
  };

  const runIntakeFlowMatch = async () => {
    setLoading('intake');
    setError(null);

    try {
      const created = await requestJson<{ intake: { id: string } }>(`${apiBase}/api/intakes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          facts: {
            profile: facts.profile
          },
          meta: {
            source: 'web-loan-matcher-tester'
          }
        })
      });

      const intakeId = created.intake.id;
      setLastIntakeId(intakeId);

      await requestJson(`${apiBase}/api/intakes/${intakeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facts })
      });

      const matched = await requestJson<{ intakeId: string; match: MatchView }>(
        `${apiBase}/api/intakes/${intakeId}/match`,
        { method: 'POST' }
      );

      setMatch(matched.match);
      setRawResponse(JSON.stringify(matched, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
      setMatch(null);
      setRawResponse('');
    } finally {
      setLoading(null);
    }
  };

  const runPdfExtractAndStructure = async () => {
    if (!pdfFile) {
      setPdfError('请先选择 PDF 文件');
      return;
    }

    setPdfLoading(true);
    setPdfError(null);
    setPdfStreamStatus('准备上传 PDF...');

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);

      const extracted = await requestJson<PdfExtractResponse>(
        `${apiBase}/api/files/pdf/extract-text?maxChars=60000`,
        {
          method: 'POST',
          body: formData
        }
      );

      setPdfResult(extracted);
      setPdfStructuredResult(null);
      setPdfStreamStatus('文本提取完成，开始流式结构化抽取...');

      const agentStreamUrl = `${defaultAgentApiBase.replace(/\/$/, '')}/api/pdf/extract-structured/stream`;
      const streamResponse = await fetch(agentStreamUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          pdfText: extracted.text,
          maxInputChars: 60000
        })
      });

      if (!streamResponse.ok) {
        const payload = (await streamResponse.json().catch(() => null)) as unknown;
        throw new Error(parseErrorPayload(payload, streamResponse.status));
      }

      if (!streamResponse.body) {
        throw new Error('流式响应无可读取内容');
      }

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamDone = false;
      let finalStructured: StructuredPdfExtractResponse | null = null;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const dividerIndex = buffer.indexOf('\n\n');
          if (dividerIndex < 0) {
            break;
          }

          const rawChunk = buffer.slice(0, dividerIndex);
          buffer = buffer.slice(dividerIndex + 2);

          const dataText = parseSseDataChunk(rawChunk);
          if (!dataText) {
            continue;
          }

          let event: StructuredPdfSseEvent;
          try {
            event = JSON.parse(dataText) as StructuredPdfSseEvent;
          } catch {
            continue;
          }

          if (event.type === 'start') {
            setPdfStreamStatus('流式抽取已开始');
            continue;
          }

          if (event.type === 'status') {
            setPdfStreamStatus(`状态: ${formatPdfStreamStatus(event.data)}`);
            continue;
          }

          if (event.type === 'partial') {
            setPdfStreamStatus(
              `流式更新中：查询${event.data.queryRecordsCount} / 贷款${event.data.loanRecordsCount} / 信用卡${event.data.creditCardRecordsCount}`
            );
            setFacts((prev) => ({
              ...prev,
              credit: {
                ...prev.credit,
                ...event.data.factsPatch.credit
              }
            }));
            continue;
          }

          if (event.type === 'result') {
            finalStructured = event.data;
            setPdfStructuredResult(event.data);
            setFacts((prev) => ({
              ...prev,
              credit: {
                ...prev.credit,
                ...event.data.factsPatch.credit
              }
            }));
            setPdfStreamStatus('流式抽取完成');
            continue;
          }

          if (event.type === 'error') {
            throw new Error(event.data || '流式抽取失败');
          }

          if (event.type === 'done') {
            streamDone = true;
            break;
          }
        }
      }

      if (!finalStructured) {
        setPdfStreamStatus('流式未返回最终结果，使用普通接口重试...');
        const structuredFallback = await trpc.pdf.extractStructured.mutate({
          pdfText: extracted.text,
          maxInputChars: 60000
        });

        finalStructured = structuredFallback;
        setPdfStructuredResult(structuredFallback);
        setFacts((prev) => ({
          ...prev,
          credit: {
            ...prev.credit,
            ...structuredFallback.factsPatch.credit
          }
        }));
        setPdfStreamStatus('已通过普通接口完成结构化抽取');
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF 结构化提取失败');
      setPdfResult(null);
      setPdfStructuredResult(null);
      setPdfStreamStatus(null);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} />
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Loan Match Sandbox</p>
            <h1 className={styles.title}>贷款产品匹配测试页</h1>
            <p className={styles.subtitle}>可手工填写客户信息，或上传 PDF 自动提取并回填征信字段。</p>
          </div>
          <div className={styles.headerActions}>
            <Link href="/agent" className={styles.ghostButton}>
              返回 Agent 聊天页
            </Link>
          </div>
        </header>

        <section className={styles.block}>
          <h2>Loan API 地址</h2>
          <input
            className={styles.input}
            value={apiBase}
            onChange={(event) => setApiBase(event.target.value)}
            placeholder="http://localhost:3002"
          />
        </section>

        <section className={styles.grid}>
          <article className={styles.block}>
            <h2>客户画像</h2>
            <label className={styles.field}>
              <span>身份</span>
              <select
                className={styles.input}
                value={facts.profile.identity ?? ''}
                onChange={(event) => updateProfile('identity', event.target.value || undefined)}
              >
                <option value="">未填写</option>
                <option value="上班族">上班族</option>
                <option value="自由职业">自由职业</option>
                <option value="个体户">个体户</option>
                <option value="企业主">企业主</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>性别</span>
              <select
                className={styles.input}
                value={facts.profile.gender ?? ''}
                onChange={(event) => {
                  if (!event.target.value) {
                    updateProfile('gender', undefined);
                    return;
                  }

                  updateProfile('gender', event.target.value as 'male' | 'female');
                }}
              >
                <option value="">未填写</option>
                <option value="male">male</option>
                <option value="female">female</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>学历</span>
              <select
                className={styles.input}
                value={facts.profile.education ?? ''}
                onChange={(event) => updateProfile('education', event.target.value || undefined)}
              >
                <option value="">未填写</option>
                <option value="高中以下">高中以下</option>
                <option value="大专">大专</option>
                <option value="本科">本科</option>
                <option value="硕士">硕士</option>
                <option value="博士">博士</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>年龄</span>
              <input
                className={styles.input}
                type="number"
                value={facts.profile.age ?? ''}
                onChange={(event) => updateProfile('age', parseOptionalNumber(event.target.value))}
                placeholder="例如 30"
              />
            </label>
            <label className={styles.field}>
              <span>城市</span>
              <input
                className={styles.input}
                value={facts.profile.city ?? ''}
                onChange={(event) => updateProfile('city', event.target.value.trim() || undefined)}
                placeholder="例如 上海"
              />
            </label>
            <label className={styles.field}>
              <span>月收入</span>
              <input
                className={styles.input}
                type="number"
                value={facts.profile.monthlyIncome ?? ''}
                onChange={(event) => updateProfile('monthlyIncome', parseOptionalNumber(event.target.value))}
                placeholder="例如 12000"
              />
            </label>
            <div className={styles.switchRow}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(facts.profile.mainlandHukou)}
                  onChange={(event) => updateProfile('mainlandHukou', event.target.checked)}
                />
                大陆户籍
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(facts.profile.qualifiedEmployer)}
                  onChange={(event) => updateProfile('qualifiedEmployer', event.target.checked)}
                />
                优质单位
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(facts.profile.hasProperty)}
                  onChange={(event) => updateProfile('hasProperty', event.target.checked)}
                />
                有房
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(facts.profile.hasCar)}
                  onChange={(event) => updateProfile('hasCar', event.target.checked)}
                />
                有车
              </label>
            </div>
          </article>

          <article className={styles.block}>
            <h2>公积金 / 社保</h2>
            <div className={styles.switchRow}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(facts.profile.hasGJJ)}
                  onChange={(event) => updateProfile('hasGJJ', event.target.checked)}
                />
                有公积金
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(facts.profile.hasShebao)}
                  onChange={(event) => updateProfile('hasShebao', event.target.checked)}
                />
                有社保
              </label>
            </div>
            <label className={styles.field}>
              <span>公积金基数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.profile.gjjBase ?? ''}
                onChange={(event) => updateProfile('gjjBase', parseOptionalNumber(event.target.value))}
                placeholder="例如 5000"
              />
            </label>
            <label className={styles.field}>
              <span>公积金连续缴纳（月）</span>
              <input
                className={styles.input}
                type="number"
                value={facts.profile.gjjMonths ?? ''}
                onChange={(event) => updateProfile('gjjMonths', parseOptionalNumber(event.target.value))}
                placeholder="例如 12"
              />
            </label>
            <label className={styles.field}>
              <span>社保基数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.profile.shebaoBase ?? ''}
                onChange={(event) => updateProfile('shebaoBase', parseOptionalNumber(event.target.value))}
                placeholder="例如 5000"
              />
            </label>
            <label className={styles.field}>
              <span>社保连续缴纳（月）</span>
              <input
                className={styles.input}
                type="number"
                value={facts.profile.shebaoMonths ?? ''}
                onChange={(event) => updateProfile('shebaoMonths', parseOptionalNumber(event.target.value))}
                placeholder="例如 12"
              />
            </label>
          </article>

          <article className={styles.block}>
            <h2>征信与负债</h2>
            <label className={styles.field}>
              <span>近1个月查询次数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.queryCount1M ?? ''}
                onChange={(event) => updateCredit('queryCount1M', parseOptionalNumber(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>近2个月查询次数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.queryCount2M ?? ''}
                onChange={(event) => updateCredit('queryCount2M', parseOptionalNumber(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>近3个月查询次数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.queryCount3M ?? ''}
                onChange={(event) => updateCredit('queryCount3M', parseOptionalNumber(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>近6个月查询次数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.queryCount6M ?? ''}
                onChange={(event) => updateCredit('queryCount6M', parseOptionalNumber(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>信用卡使用率</span>
              <input
                className={styles.input}
                type="number"
                step="0.01"
                value={facts.credit.creditUsage ?? ''}
                onChange={(event) => updateCredit('creditUsage', parseOptionalNumber(event.target.value))}
                placeholder="0 - 1"
              />
            </label>
            <label className={styles.field}>
              <span>信用卡张数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.creditCards ?? ''}
                onChange={(event) => updateCredit('creditCards', parseOptionalNumber(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>未结清信用贷笔数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.unsettledCreditLoans ?? ''}
                onChange={(event) => updateCredit('unsettledCreditLoans', parseOptionalNumber(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>贷款机构数（不含房车）</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.institutions ?? ''}
                onChange={(event) => updateCredit('institutions', parseOptionalNumber(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>非银机构数</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.nonBankInstitutions ?? ''}
                onChange={(event) => updateCredit('nonBankInstitutions', parseOptionalNumber(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span>授信总额（万）</span>
              <input
                className={styles.input}
                type="number"
                value={facts.credit.totalCreditLimitWan ?? ''}
                onChange={(event) => updateCredit('totalCreditLimitWan', parseOptionalNumber(event.target.value))}
              />
            </label>
            <div className={styles.switchRow}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(facts.credit.currentOverdue)}
                  onChange={(event) => updateCredit('currentOverdue', event.target.checked)}
                />
                当前逾期
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(facts.credit.outstandingMicroLoan)}
                  onChange={(event) => updateCredit('outstandingMicroLoan', event.target.checked)}
                />
                有未结清小额贷
              </label>
            </div>
          </article>

          <article className={styles.block}>
            <h2>经营信息 & 操作</h2>
            <label className={styles.field}>
              <span>有营业执照</span>
              <select
                className={styles.input}
                value={
                  facts.business.hasBizLicense === undefined
                    ? ''
                    : facts.business.hasBizLicense
                      ? 'yes'
                      : 'no'
                }
                onChange={(event) => {
                  if (!event.target.value) {
                    updateBusiness('hasBizLicense', undefined);
                    return;
                  }
                  updateBusiness('hasBizLicense', event.target.value === 'yes');
                }}
              >
                <option value="">未填写</option>
                <option value="no">否</option>
                <option value="yes">是</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>经营时长（月）</span>
              <input
                className={styles.input}
                type="number"
                value={facts.business.bizAgeMonths ?? ''}
                onChange={(event) => updateBusiness('bizAgeMonths', parseOptionalNumber(event.target.value))}
              />
            </label>
            <div className={styles.actions}>
              <button className={styles.button} onClick={runDirectMatch} disabled={loading !== null}>
                {loading === 'direct' ? '匹配中...' : '直接匹配 /api/match'}
              </button>
              <button className={styles.buttonAlt} onClick={runIntakeFlowMatch} disabled={loading !== null}>
                {loading === 'intake' ? '处理中...' : '走收集流程匹配'}
              </button>
              <button className={styles.ghostButton} onClick={clearFactForm} disabled={loading !== null}>
                清空当前填写
              </button>
            </div>
          </article>

          <article className={styles.block}>
            <h2>PDF 结构化提取</h2>
            <label className={styles.field}>
              <span>上传 PDF</span>
              <input
                className={styles.input}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setPdfFile(file);
                  setPdfError(null);
                }}
              />
            </label>
            <div className={styles.actions}>
              <button className={styles.buttonAlt} onClick={runPdfExtractAndStructure} disabled={pdfLoading}>
                {pdfLoading ? '解析中...' : '上传并结构化解析'}
              </button>
            </div>
            {pdfStreamStatus ? <p className={styles.meta}>流式状态: {pdfStreamStatus}</p> : null}
            {pdfError ? <p className={styles.error}>{pdfError}</p> : null}
            {pdfResult ? (
              <div className={styles.pdfResult}>
                <p>
                  文件: <strong>{pdfResult.fileName}</strong>
                </p>
                <p>
                  页数: {pdfResult.pageCount} | 文本长度: {pdfResult.textLength} | 返回长度: {pdfResult.returnedLength}
                </p>
                <p>文本截断: {pdfResult.isTruncated ? '是' : '否'}</p>
              </div>
            ) : null}

            {pdfStructuredResult ? (
              <div className={styles.pdfResult}>
                <p>
                  结构化提取完成，已自动回填征信字段，可直接点击匹配。
                </p>
                <p>
                  报告日期: {pdfStructuredResult.reportDate ?? '未识别'} | 结构化输入截断:{' '}
                  {pdfStructuredResult.sourceTruncated ? '是' : '否'}
                </p>
                <p>
                  查询记录: {pdfStructuredResult.queryRecords.length} | 贷款明细: {pdfStructuredResult.loanRecords.length} |
                  信用卡明细: {pdfStructuredResult.creditCardRecords.length}
                </p>
                {pdfStructuredResult.warnings.length > 0 ? (
                  <ul className={styles.warningList}>
                    {pdfStructuredResult.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <details className={styles.raw}>
                  <summary>查看结构化 JSON</summary>
                  <pre>{JSON.stringify(pdfStructuredResult, null, 2)}</pre>
                </details>
              </div>
            ) : null}
          </article>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.result}>
          <h2>匹配结果</h2>
          {lastIntakeId ? <p className={styles.meta}>最近 intakeId: {lastIntakeId}</p> : null}
          {match ? (
            <div className={styles.resultBody}>
              <p className={styles.summary}>
                命中: <strong>{match.hit ? '是' : '否'}</strong> | 规则数: {match.totalRules} | 耗时:{' '}
                {match.elapsedMs}ms
              </p>
              {match.matches.length === 0 ? (
                <p className={styles.empty}>当前未命中任何产品，请调整客户信息后重试。</p>
              ) : (
                <ul className={styles.matchList}>
                  {match.matches.map((item) => (
                    <li key={item.ruleId} className={styles.matchItem}>
                      <div className={styles.matchTitle}>
                        {item.product?.name ?? item.ruleId}
                        <span>{item.product?.institution ?? 'Unknown'}</span>
                      </div>
                      <div className={styles.tags}>
                        {(item.reasonCodes ?? []).map((code) => (
                          <span key={code}>{code}</span>
                        ))}
                      </div>
                      {item.product ? (
                        <div className={styles.productMeta}>
                          <span>
                            额度: {item.product.amountRange[0]} - {item.product.amountRange[1]}
                          </span>
                          <span>
                            期限: {item.product.termRange[0]} - {item.product.termRange[1]} 月
                          </span>
                          <span>
                            年化: {item.product.rateRange[0]}% - {item.product.rateRange[1]}%
                          </span>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className={styles.empty}>点击上方按钮开始匹配。</p>
          )}
          {rawResponse ? (
            <details className={styles.raw}>
              <summary>查看原始响应 JSON</summary>
              <pre>{rawResponse}</pre>
            </details>
          ) : null}
        </section>
      </section>
    </main>
  );
}
