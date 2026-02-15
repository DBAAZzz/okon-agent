import type { RuleOperator } from './types.js';

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const EDUCATION_RANK = new Map<string, number>([
  ['高中以下', 1],
  ['大专', 2],
  ['本科', 3],
  ['硕士', 4],
  ['博士', 5]
]);

const eq: RuleOperator = ({ factValue, expectedValue }) => factValue === expectedValue;
const neq: RuleOperator = ({ factValue, expectedValue }) => factValue !== expectedValue;

const gt: RuleOperator = ({ factValue, expectedValue }) => {
  const left = toNumber(factValue);
  const right = toNumber(expectedValue);
  return left !== undefined && right !== undefined && left > right;
};

const gte: RuleOperator = ({ factValue, expectedValue }) => {
  const left = toNumber(factValue);
  const right = toNumber(expectedValue);
  return left !== undefined && right !== undefined && left >= right;
};

const lt: RuleOperator = ({ factValue, expectedValue }) => {
  const left = toNumber(factValue);
  const right = toNumber(expectedValue);
  return left !== undefined && right !== undefined && left < right;
};

const lte: RuleOperator = ({ factValue, expectedValue }) => {
  const left = toNumber(factValue);
  const right = toNumber(expectedValue);
  return left !== undefined && right !== undefined && left <= right;
};

const oneOf: RuleOperator = ({ factValue, expectedValue }) => {
  const candidates = toArray(expectedValue);
  return candidates.some((candidate) => candidate === factValue);
};

const notOneOf: RuleOperator = ({ factValue, expectedValue }) => {
  const candidates = toArray(expectedValue);
  return !candidates.some((candidate) => candidate === factValue);
};

const between: RuleOperator = ({ factValue, expectedValue }) => {
  const value = toNumber(factValue);
  if (value === undefined || !Array.isArray(expectedValue) || expectedValue.length !== 2) {
    return false;
  }

  const min = toNumber(expectedValue[0]);
  const max = toNumber(expectedValue[1]);
  if (min === undefined || max === undefined) {
    return false;
  }

  return value >= min && value <= max;
};

const contains: RuleOperator = ({ factValue, expectedValue }) => {
  if (typeof factValue === 'string' && typeof expectedValue === 'string') {
    return factValue.includes(expectedValue);
  }

  if (Array.isArray(factValue)) {
    return factValue.some((item) => item === expectedValue);
  }

  return false;
};

const startsWith: RuleOperator = ({ factValue, expectedValue }) =>
  typeof factValue === 'string' &&
  typeof expectedValue === 'string' &&
  factValue.startsWith(expectedValue);

const endsWith: RuleOperator = ({ factValue, expectedValue }) =>
  typeof factValue === 'string' &&
  typeof expectedValue === 'string' &&
  factValue.endsWith(expectedValue);

const regex: RuleOperator = ({ factValue, expectedValue }) => {
  if (typeof factValue !== 'string') {
    return false;
  }

  if (typeof expectedValue === 'string') {
    return new RegExp(expectedValue).test(factValue);
  }

  if (isRecord(expectedValue) && typeof expectedValue.pattern === 'string') {
    const flags = typeof expectedValue.flags === 'string' ? expectedValue.flags : '';
    return new RegExp(expectedValue.pattern, flags).test(factValue);
  }

  return false;
};

const exists: RuleOperator = ({ factValue }) => factValue !== null && factValue !== undefined;
const notExists: RuleOperator = ({ factValue }) => factValue === null || factValue === undefined;
const truthy: RuleOperator = ({ factValue }) => Boolean(factValue);
const falsy: RuleOperator = ({ factValue }) => !factValue;

const educationGte: RuleOperator = ({ factValue, expectedValue }) => {
  if (typeof factValue !== 'string' || typeof expectedValue !== 'string') {
    return false;
  }

  const factRank = EDUCATION_RANK.get(factValue);
  const expectedRank = EDUCATION_RANK.get(expectedValue);

  if (factRank === undefined || expectedRank === undefined) {
    return false;
  }

  return factRank >= expectedRank;
};

export function createDefaultOperators(): Map<string, RuleOperator> {
  return new Map<string, RuleOperator>([
    ['eq', eq],
    ['neq', neq],
    ['gt', gt],
    ['gte', gte],
    ['lt', lt],
    ['lte', lte],
    ['in', oneOf],
    ['notIn', notOneOf],
    ['between', between],
    ['contains', contains],
    ['startsWith', startsWith],
    ['endsWith', endsWith],
    ['regex', regex],
    ['educationGte', educationGte],
    ['exists', exists],
    ['notExists', notExists],
    ['truthy', truthy],
    ['falsy', falsy]
  ]);
}
