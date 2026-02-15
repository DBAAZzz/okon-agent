export class RuleEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleEngineError';
  }
}

export class RuleValidationError extends RuleEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'RuleValidationError';
  }
}

