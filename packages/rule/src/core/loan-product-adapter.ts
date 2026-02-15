import { RuleValidationError } from './errors.js';
import type { RuleCondition, RuleDefinition } from './types.js';
import type { LoanProduct } from '../models/loan-product.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberTuple(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim() !== '');
}

function parseLoanProduct(source: string, raw: unknown): LoanProduct {
  if (!isRecord(raw)) {
    throw new RuleValidationError(`${source}: loan product must be an object`);
  }

  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    throw new RuleValidationError(`${source}: "id" must be a non-empty string`);
  }

  if (typeof raw.name !== 'string' || raw.name.trim() === '') {
    throw new RuleValidationError(`${source}: "name" must be a non-empty string`);
  }

  if (typeof raw.institution !== 'string' || raw.institution.trim() === '') {
    throw new RuleValidationError(`${source}: "institution" must be a non-empty string`);
  }

  if (!isNumberTuple(raw.amountRange)) {
    throw new RuleValidationError(`${source}: "amountRange" must be [number, number]`);
  }

  if (!isNumberTuple(raw.termRange)) {
    throw new RuleValidationError(`${source}: "termRange" must be [number, number]`);
  }

  if (!isNumberTuple(raw.rateRange)) {
    throw new RuleValidationError(`${source}: "rateRange" must be [number, number]`);
  }

  if (!isStringArray(raw.repaymentMethods) || raw.repaymentMethods.length === 0) {
    throw new RuleValidationError(`${source}: "repaymentMethods" must be non-empty string[]`);
  }

  if (!isRecord(raw.rules)) {
    throw new RuleValidationError(`${source}: "rules" must be an object`);
  }

  if (raw.rules.allowedIdentities !== undefined && !isStringArray(raw.rules.allowedIdentities)) {
    throw new RuleValidationError(`${source}: "rules.allowedIdentities" must be string[]`);
  }

  if (raw.rules.allowedCities !== undefined && !isStringArray(raw.rules.allowedCities)) {
    throw new RuleValidationError(`${source}: "rules.allowedCities" must be string[]`);
  }

  if (typeof raw.fullRuleText !== 'string' || raw.fullRuleText.trim() === '') {
    throw new RuleValidationError(`${source}: "fullRuleText" must be a non-empty string`);
  }

  if (raw.bonuses !== undefined) {
    if (!isRecord(raw.bonuses)) {
      throw new RuleValidationError(`${source}: "bonuses" must be an object`);
    }
    for (const [key, value] of Object.entries(raw.bonuses)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        throw new RuleValidationError(`${source}: "bonuses" must be Record<string, string>`);
      }
    }
  }

  return raw as unknown as LoanProduct;
}

function buildReasonCodes(product: LoanProduct): string[] {
  const reasonCodes = ['PRODUCT_RULES_MATCHED'];

  if (product.rules.requireMainlandHukou) {
    reasonCodes.push('MAINLAND_HUKOU_REQUIRED');
  }
  if (product.rules.requireQualifiedEmployer) {
    reasonCodes.push('QUALIFIED_EMPLOYER_REQUIRED');
  }
  if (product.rules.requireGJJ) {
    reasonCodes.push('GJJ_REQUIRED');
  }
  if (product.rules.requireShebao) {
    reasonCodes.push('SHEBAO_REQUIRED');
  }
  if (product.rules.requireBizLicense) {
    reasonCodes.push('BIZ_LICENSE_REQUIRED');
  }

  return reasonCodes;
}

function createLoanProductConditions(product: LoanProduct): RuleCondition[] {
  const conditions: RuleCondition[] = [];
  const { rules } = product;

  if (rules.minAge !== undefined) {
    conditions.push({ fact: 'profile.age', operator: 'gte', value: rules.minAge });
  }

  if (rules.maxAge !== undefined) {
    conditions.push({ fact: 'profile.age', operator: 'lte', value: rules.maxAge });
  }

  if (rules.maxAgeFemale !== undefined) {
    conditions.push({
      any: [
        { fact: 'profile.gender', operator: 'neq', value: 'female' },
        { fact: 'profile.age', operator: 'lte', value: rules.maxAgeFemale }
      ]
    });
  }

  if (rules.allowedCities && rules.allowedCities.length > 0) {
    conditions.push({ fact: 'profile.city', operator: 'in', value: rules.allowedCities });
  }

  if (rules.requireMainlandHukou) {
    conditions.push({ fact: 'profile.mainlandHukou', operator: 'eq', value: true });
  }

  if (rules.allowedIdentities && rules.allowedIdentities.length > 0) {
    conditions.push({ fact: 'profile.identity', operator: 'in', value: rules.allowedIdentities });
  }

  if (rules.requireQualifiedEmployer) {
    conditions.push({ fact: 'profile.qualifiedEmployer', operator: 'eq', value: true });
  }

  if (rules.minEducation !== undefined) {
    conditions.push({ fact: 'profile.education', operator: 'educationGte', value: rules.minEducation });
  }

  if (rules.requireGJJ) {
    conditions.push({ fact: 'profile.hasGJJ', operator: 'eq', value: true });
  }

  if (rules.minGJJBase !== undefined) {
    conditions.push({ fact: 'profile.gjjBase', operator: 'gte', value: rules.minGJJBase });
  }

  if (rules.minGJJMonths !== undefined) {
    conditions.push({ fact: 'profile.gjjMonths', operator: 'gte', value: rules.minGJJMonths });
  }

  if (rules.requireShebao) {
    conditions.push({ fact: 'profile.hasShebao', operator: 'eq', value: true });
  }

  if (rules.minShebaoMonths !== undefined) {
    conditions.push({ fact: 'profile.shebaoMonths', operator: 'gte', value: rules.minShebaoMonths });
  }

  if (rules.minShebaoBase !== undefined) {
    conditions.push({ fact: 'profile.shebaoBase', operator: 'gte', value: rules.minShebaoBase });
  }

  if (rules.minSalary !== undefined) {
    conditions.push({ fact: 'profile.monthlyIncome', operator: 'gte', value: rules.minSalary });
  }

  if (rules.requireProperty) {
    conditions.push({ fact: 'profile.hasProperty', operator: 'eq', value: true });
  }

  if (rules.requireCar) {
    conditions.push({ fact: 'profile.hasCar', operator: 'eq', value: true });
  }

  if (rules.requireBizLicense) {
    conditions.push({ fact: 'business.hasBizLicense', operator: 'eq', value: true });
  }

  if (rules.minBizAge !== undefined) {
    conditions.push({ fact: 'business.bizAgeMonths', operator: 'gte', value: rules.minBizAge });
  }

  if (rules.maxQueryCount1M !== undefined) {
    conditions.push({ fact: 'credit.queryCount1M', operator: 'lte', value: rules.maxQueryCount1M });
  }

  if (rules.maxQueryCount2M !== undefined) {
    conditions.push({ fact: 'credit.queryCount2M', operator: 'lte', value: rules.maxQueryCount2M });
  }

  if (rules.maxQueryCount3M !== undefined) {
    conditions.push({ fact: 'credit.queryCount3M', operator: 'lte', value: rules.maxQueryCount3M });
  }

  if (rules.maxQueryCount6M !== undefined) {
    conditions.push({ fact: 'credit.queryCount6M', operator: 'lte', value: rules.maxQueryCount6M });
  }

  if (rules.noCurrentOverdue) {
    conditions.push({ fact: 'credit.currentOverdue', operator: 'eq', value: false });
  }

  if (rules.maxCreditUsage !== undefined) {
    conditions.push({ fact: 'credit.creditUsage', operator: 'lte', value: rules.maxCreditUsage });
  }

  if (rules.maxCreditCards !== undefined) {
    conditions.push({ fact: 'credit.creditCards', operator: 'lte', value: rules.maxCreditCards });
  }

  if (rules.maxUnsettledCreditLoans !== undefined) {
    conditions.push({
      fact: 'credit.unsettledCreditLoans',
      operator: 'lte',
      value: rules.maxUnsettledCreditLoans
    });
  }

  if (rules.maxInstitutions !== undefined) {
    conditions.push({ fact: 'credit.institutions', operator: 'lte', value: rules.maxInstitutions });
  }

  if (rules.maxNonBankInstitutions !== undefined) {
    conditions.push({
      fact: 'credit.nonBankInstitutions',
      operator: 'lte',
      value: rules.maxNonBankInstitutions
    });
  }

  if (rules.noOutstandingMicroLoan) {
    conditions.push({ fact: 'credit.outstandingMicroLoan', operator: 'eq', value: false });
  }

  if (rules.maxTotalCreditLimit !== undefined) {
    conditions.push({
      fact: 'credit.totalCreditLimitWan',
      operator: 'lte',
      value: rules.maxTotalCreditLimit
    });
  }

  return conditions;
}

export function isLoanProductDocument(raw: unknown): boolean {
  if (!isRecord(raw)) {
    return false;
  }

  return (
    typeof raw.id === 'string' &&
    typeof raw.name === 'string' &&
    typeof raw.institution === 'string' &&
    Array.isArray(raw.repaymentMethods) &&
    isRecord(raw.rules) &&
    typeof raw.fullRuleText === 'string'
  );
}

export function loanProductToRuleDefinition(source: string, raw: unknown): RuleDefinition {
  const product = parseLoanProduct(source, raw);
  const conditions = createLoanProductConditions(product);

  if (conditions.length === 0) {
    throw new RuleValidationError(`${source}: no executable rule conditions generated from loan product`);
  }

  return {
    id: product.id,
    name: `${product.name}(${product.institution})`,
    version: '1.0.0',
    enabled: true,
    priority: 100,
    stopOnMatch: false,
    when: { all: conditions },
    outcome: {
      action: 'MATCH_PRODUCT',
      reasonCodes: buildReasonCodes(product),
      payload: {
        product
      }
    }
  };
}
