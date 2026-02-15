export { default } from './fastify/plugin.js';
export { JsonRulesEngine } from './core/engine.js';
export { RuleEngineError, RuleValidationError } from './core/errors.js';
export { getFactValue } from './core/facts.js';
export { createDefaultOperators } from './core/operators.js';
export {
  default as rulesEnginePlugin,
  rulesEnginePlugin as rulesEnginePluginCallback
} from './fastify/plugin.js';
export * from './core/types.js';
export * from './models/loan-product.js';
