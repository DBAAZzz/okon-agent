import { watch, type FSWatcher } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RuleEngineError } from './errors.js';
import { getFactValue } from './facts.js';
import { isLoanProductDocument, loanProductToRuleDefinition } from './loan-product-adapter.js';
import { createDefaultOperators } from './operators.js';
import type {
  EvaluateAllRulesResult,
  EvaluateRuleResult,
  Facts,
  RuleCondition,
  RuleConditionLeaf,
  RuleDefinition,
  RuleMatch,
  RuleOperator,
  RulesEngineLogger,
  RulesEngineOptions,
  RuleSummary
} from './types.js';
import { normalizeRuleDefinition } from './validation.js';

const DEFAULT_RELOAD_DEBOUNCE_MS = 250;

const noop = () => {};

function createLogger(logger?: Partial<RulesEngineLogger>): RulesEngineLogger {
  return {
    debug: logger?.debug ?? noop,
    info: logger?.info ?? noop,
    warn: logger?.warn ?? noop,
    error: logger?.error ?? noop
  };
}

function cloneOutcome(rule: RuleDefinition): RuleMatch['outcome'] {
  return {
    action: rule.outcome.action,
    reasonCodes: rule.outcome.reasonCodes ? [...rule.outcome.reasonCodes] : undefined,
    score: rule.outcome.score,
    payload: rule.outcome.payload ? { ...rule.outcome.payload } : undefined
  };
}

export class JsonRulesEngine {
  private readonly rulesDir: string;
  private readonly watchEnabled: boolean;
  private readonly reloadDebounceMs: number;
  private readonly logger: RulesEngineLogger;
  private readonly operators: Map<string, RuleOperator>;
  private rulesById = new Map<string, RuleDefinition>();
  private orderedRules: RuleDefinition[] = [];
  private watcher: FSWatcher | undefined;
  private reloadTimer: NodeJS.Timeout | undefined;

  constructor(options: RulesEngineOptions) {
    if (!options.rulesDir || options.rulesDir.trim() === '') {
      throw new RuleEngineError('"rulesDir" is required');
    }

    this.rulesDir = options.rulesDir;
    this.watchEnabled = options.watch ?? false;
    this.reloadDebounceMs = options.reloadDebounceMs ?? DEFAULT_RELOAD_DEBOUNCE_MS;
    this.logger = createLogger(options.logger);
    this.operators = createDefaultOperators();
  }

  async init(): Promise<void> {
    await this.reload();

    if (this.watchEnabled) {
      this.startWatching();
    }
  }

  async close(): Promise<void> {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = undefined;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  registerOperator(name: string, operator: RuleOperator): void {
    if (!name || name.trim() === '') {
      throw new RuleEngineError('Operator name must be a non-empty string');
    }

    this.operators.set(name, operator);
  }

  hasRule(ruleId: string): boolean {
    return this.rulesById.has(ruleId);
  }

  listRules(): RuleSummary[] {
    return this.orderedRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      version: rule.version,
      enabled: rule.enabled ?? true,
      priority: rule.priority ?? 0,
      stopOnMatch: rule.stopOnMatch ?? false
    }));
  }

  async reload(): Promise<void> {
    const loadedRules = await this.loadFromDirectory();
    this.rulesById = loadedRules.rulesById;
    this.orderedRules = loadedRules.orderedRules;

    this.logger.info('Rules reloaded', {
      rulesDir: this.rulesDir,
      count: this.orderedRules.length
    });
  }

  async evaluate(ruleId: string, facts: Facts): Promise<EvaluateRuleResult> {
    const rule = this.rulesById.get(ruleId);
    if (!rule) {
      throw new RuleEngineError(`Rule "${ruleId}" not found`);
    }

    return this.evaluateRule(rule, facts);
  }

  async evaluateAll(facts: Facts): Promise<EvaluateAllRulesResult> {
    const startedAt = performance.now();
    const matches: RuleMatch[] = [];

    for (const rule of this.orderedRules) {
      if (rule.enabled === false) {
        continue;
      }

      const result = await this.evaluateRule(rule, facts);
      if (!result.matched || !result.match) {
        continue;
      }

      matches.push(result.match);

      if (rule.stopOnMatch) {
        break;
      }
    }

    return {
      hit: matches.length > 0,
      totalRules: this.orderedRules.length,
      matches,
      elapsedMs: Number((performance.now() - startedAt).toFixed(3))
    };
  }

  private async evaluateRule(rule: RuleDefinition, facts: Facts): Promise<EvaluateRuleResult> {
    if (rule.enabled === false) {
      return {
        matched: false,
        elapsedMs: 0
      };
    }

    const startedAt = performance.now();
    const matched = await this.evaluateCondition(rule.when, facts);
    const elapsedMs = Number((performance.now() - startedAt).toFixed(3));

    if (!matched) {
      return {
        matched: false,
        elapsedMs
      };
    }

    return {
      matched: true,
      elapsedMs,
      match: {
        ruleId: rule.id,
        name: rule.name,
        version: rule.version,
        priority: rule.priority ?? 0,
        outcome: cloneOutcome(rule),
        evaluationMs: elapsedMs
      }
    };
  }

  private async evaluateCondition(condition: RuleCondition, facts: Facts): Promise<boolean> {
    if ('all' in condition) {
      for (const nested of condition.all) {
        if (!(await this.evaluateCondition(nested, facts))) {
          return false;
        }
      }
      return true;
    }

    if ('any' in condition) {
      for (const nested of condition.any) {
        if (await this.evaluateCondition(nested, facts)) {
          return true;
        }
      }
      return false;
    }

    if ('not' in condition) {
      return !(await this.evaluateCondition(condition.not, facts));
    }

    return this.evaluateLeaf(condition, facts);
  }

  private async evaluateLeaf(condition: RuleConditionLeaf, facts: Facts): Promise<boolean> {
    const operator = this.operators.get(condition.operator);
    if (!operator) {
      throw new RuleEngineError(
        `Unknown operator "${condition.operator}" in rule condition for fact "${condition.fact}"`
      );
    }

    const factValue = getFactValue(facts, condition.fact);
    return operator({
      factValue,
      expectedValue: condition.value,
      facts,
      leaf: condition
    });
  }

  private async loadFromDirectory(): Promise<{
    rulesById: Map<string, RuleDefinition>;
    orderedRules: RuleDefinition[];
  }> {
    const entries = await readdir(this.rulesDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();

    const rulesById = new Map<string, RuleDefinition>();
    const loadedRules: RuleDefinition[] = [];

    for (const fileName of files) {
      const filePath = join(this.rulesDir, fileName);
      const content = await readFile(filePath, 'utf8');

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        throw new RuleEngineError(`Invalid JSON in ${filePath}: ${String(error)}`);
      }

      const rule = isLoanProductDocument(parsed)
        ? loanProductToRuleDefinition(filePath, parsed)
        : normalizeRuleDefinition(parsed, filePath);
      if (rulesById.has(rule.id)) {
        throw new RuleEngineError(`Duplicate rule id "${rule.id}" found in ${filePath}`);
      }

      rulesById.set(rule.id, rule);
      loadedRules.push(rule);
    }

    loadedRules.sort((left, right) => {
      const priorityDiff = (right.priority ?? 0) - (left.priority ?? 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return left.id.localeCompare(right.id);
    });

    return { rulesById, orderedRules: loadedRules };
  }

  private startWatching(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = watch(this.rulesDir, (eventType, fileName) => {
      const normalizedFileName = fileName?.toString() ?? '';
      if (!normalizedFileName || !normalizedFileName.endsWith('.json')) {
        return;
      }

      this.logger.debug('Rule file change detected', {
        eventType,
        fileName: normalizedFileName
      });

      this.scheduleReload();
    });

    this.logger.info('Rules file watcher started', { rulesDir: this.rulesDir });
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      void this.reload().catch((error) => {
        this.logger.error('Rules reload failed', error);
      });
    }, this.reloadDebounceMs);
  }
}
