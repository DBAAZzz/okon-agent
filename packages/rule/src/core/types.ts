export type Facts = Record<string, unknown>;

export interface RuleConditionLeaf {
  fact: string;
  operator: string;
  value?: unknown;
}

export interface RuleConditionAll {
  all: RuleCondition[];
}

export interface RuleConditionAny {
  any: RuleCondition[];
}

export interface RuleConditionNot {
  not: RuleCondition;
}

export type RuleCondition = RuleConditionLeaf | RuleConditionAll | RuleConditionAny | RuleConditionNot;

export interface RuleOutcome {
  action: string;
  reasonCodes?: string[];
  score?: number;
  payload?: Record<string, unknown>;
}

export interface RuleDefinition {
  id: string;
  name?: string;
  version?: string;
  enabled?: boolean;
  priority?: number;
  stopOnMatch?: boolean;
  when: RuleCondition;
  outcome: RuleOutcome;
}

export interface RuleSummary {
  id: string;
  name?: string;
  version?: string;
  enabled: boolean;
  priority: number;
  stopOnMatch: boolean;
}

export interface RuleMatch {
  ruleId: string;
  name?: string;
  version?: string;
  priority: number;
  outcome: RuleOutcome;
  evaluationMs: number;
}

export interface EvaluateRuleResult {
  matched: boolean;
  match?: RuleMatch;
  elapsedMs: number;
}

export interface EvaluateAllRulesResult {
  hit: boolean;
  totalRules: number;
  matches: RuleMatch[];
  elapsedMs: number;
}

export interface RuleOperatorParams {
  factValue: unknown;
  expectedValue: unknown;
  facts: Facts;
  leaf: RuleConditionLeaf;
}

export type RuleOperator = (params: RuleOperatorParams) => boolean | Promise<boolean>;

export interface RulesEngineLogger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

export interface RulesEngineOptions {
  rulesDir: string;
  watch?: boolean;
  reloadDebounceMs?: number;
  logger?: Partial<RulesEngineLogger>;
}

