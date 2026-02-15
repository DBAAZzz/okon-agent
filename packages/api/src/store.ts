import type { EvaluateAllRulesResult } from '@okon/rule';
import type { UserFacts } from './schemas.js';

export interface IntakeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  facts: UserFacts;
  meta?: Record<string, unknown>;
  lastMatch?: EvaluateAllRulesResult;
}

const store = new Map<string, IntakeRecord>();

export function saveIntake(record: IntakeRecord): IntakeRecord {
  store.set(record.id, record);
  return record;
}

export function getIntake(intakeId: string): IntakeRecord | undefined {
  return store.get(intakeId);
}

export function listIntakes(): IntakeRecord[] {
  return Array.from(store.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function hasIntake(intakeId: string): boolean {
  return store.has(intakeId);
}

