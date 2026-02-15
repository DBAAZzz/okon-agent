import { RuleValidationError } from './errors.js';
import type {
  RuleCondition,
  RuleConditionAll,
  RuleConditionAny,
  RuleConditionLeaf,
  RuleConditionNot,
  RuleDefinition,
  RuleOutcome
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeConditionArray(
  value: unknown,
  source: string,
  key: 'all' | 'any'
): RuleCondition[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RuleValidationError(`${source}: "when.${key}" must be a non-empty array`);
  }

  return value.map((item, index) => normalizeCondition(item, `${source}: when.${key}[${index}]`));
}

function normalizeLeafCondition(raw: Record<string, unknown>, source: string): RuleConditionLeaf {
  if (typeof raw.fact !== 'string' || raw.fact.trim() === '') {
    throw new RuleValidationError(`${source}: condition leaf "fact" must be a non-empty string`);
  }

  if (typeof raw.operator !== 'string' || raw.operator.trim() === '') {
    throw new RuleValidationError(`${source}: condition leaf "operator" must be a non-empty string`);
  }

  return {
    fact: raw.fact,
    operator: raw.operator,
    value: raw.value
  };
}

function normalizeCondition(raw: unknown, source: string): RuleCondition {
  if (!isRecord(raw)) {
    throw new RuleValidationError(`${source}: condition must be an object`);
  }

  if ('all' in raw) {
    const allCondition: RuleConditionAll = { all: normalizeConditionArray(raw.all, source, 'all') };
    return allCondition;
  }

  if ('any' in raw) {
    const anyCondition: RuleConditionAny = { any: normalizeConditionArray(raw.any, source, 'any') };
    return anyCondition;
  }

  if ('not' in raw) {
    const notCondition: RuleConditionNot = { not: normalizeCondition(raw.not, `${source}: when.not`) };
    return notCondition;
  }

  return normalizeLeafCondition(raw, source);
}

function normalizeOutcome(raw: unknown, source: string): RuleOutcome {
  if (!isRecord(raw)) {
    throw new RuleValidationError(`${source}: "outcome" must be an object`);
  }

  if (typeof raw.action !== 'string' || raw.action.trim() === '') {
    throw new RuleValidationError(`${source}: "outcome.action" must be a non-empty string`);
  }

  if (raw.reasonCodes !== undefined) {
    if (!Array.isArray(raw.reasonCodes) || raw.reasonCodes.some((code) => typeof code !== 'string')) {
      throw new RuleValidationError(`${source}: "outcome.reasonCodes" must be a string array`);
    }
  }

  if (raw.score !== undefined && typeof raw.score !== 'number') {
    throw new RuleValidationError(`${source}: "outcome.score" must be a number`);
  }

  if (raw.payload !== undefined && !isRecord(raw.payload)) {
    throw new RuleValidationError(`${source}: "outcome.payload" must be an object`);
  }

  return {
    action: raw.action,
    reasonCodes: raw.reasonCodes as string[] | undefined,
    score: raw.score as number | undefined,
    payload: raw.payload as Record<string, unknown> | undefined
  };
}

export function normalizeRuleDefinition(raw: unknown, source: string): RuleDefinition {
  if (!isRecord(raw)) {
    throw new RuleValidationError(`${source}: rule must be an object`);
  }

  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    throw new RuleValidationError(`${source}: "id" must be a non-empty string`);
  }

  if (raw.name !== undefined && typeof raw.name !== 'string') {
    throw new RuleValidationError(`${source}: "name" must be a string`);
  }

  if (raw.version !== undefined && typeof raw.version !== 'string') {
    throw new RuleValidationError(`${source}: "version" must be a string`);
  }

  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
    throw new RuleValidationError(`${source}: "enabled" must be a boolean`);
  }

  if (raw.priority !== undefined && typeof raw.priority !== 'number') {
    throw new RuleValidationError(`${source}: "priority" must be a number`);
  }

  if (raw.stopOnMatch !== undefined && typeof raw.stopOnMatch !== 'boolean') {
    throw new RuleValidationError(`${source}: "stopOnMatch" must be a boolean`);
  }

  const condition = normalizeCondition(raw.when, `${source}: when`);
  const outcome = normalizeOutcome(raw.outcome, source);

  return {
    id: raw.id,
    name: raw.name as string | undefined,
    version: raw.version as string | undefined,
    enabled: raw.enabled ?? true,
    priority: raw.priority ?? 0,
    stopOnMatch: raw.stopOnMatch ?? false,
    when: condition,
    outcome
  };
}

