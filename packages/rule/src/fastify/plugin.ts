import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { JsonRulesEngine } from '../core/engine.js';
import type {
  EvaluateAllRulesResult,
  EvaluateRuleResult,
  Facts,
  RulesEngineOptions,
  RuleSummary
} from '../core/types.js';

export interface RulesEnginePluginOptions extends RulesEngineOptions {}

export interface FastifyRulesEngine {
  engine: JsonRulesEngine;
  evaluate: (ruleId: string, facts: Facts) => Promise<EvaluateRuleResult>;
  evaluateAll: (facts: Facts) => Promise<EvaluateAllRulesResult>;
  reload: () => Promise<void>;
  listRules: () => RuleSummary[];
}

declare module 'fastify' {
  interface FastifyInstance {
    rulesEngine: FastifyRulesEngine;
  }
}

const rulesEnginePlugin: FastifyPluginAsync<RulesEnginePluginOptions> = async (fastify, options) => {
  const engine = new JsonRulesEngine({
    ...options,
    logger: options.logger ?? {
      debug: (message, data) => fastify.log.debug({ data }, message),
      info: (message, data) => fastify.log.info({ data }, message),
      warn: (message, data) => fastify.log.warn({ data }, message),
      error: (message, data) => fastify.log.error({ data }, message)
    }
  });

  await engine.init();

  fastify.decorate('rulesEngine', {
    engine,
    evaluate: (ruleId, facts) => engine.evaluate(ruleId, facts),
    evaluateAll: (facts) => engine.evaluateAll(facts),
    reload: () => engine.reload(),
    listRules: () => engine.listRules()
  });

  fastify.addHook('onClose', async () => {
    await engine.close();
  });

  fastify.log.info(
    {
      rulesDir: options.rulesDir,
      rulesCount: engine.listRules().length
    },
    'Rules engine loaded'
  );
};

export default fp(rulesEnginePlugin, {
  name: 'rules-engine'
});

export { rulesEnginePlugin };
