import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { JsonRulesEngine } from '../src/core/engine.js';

async function createTempRulesDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'okon-rules-'));
}

test('evaluateAll should return matches ordered by priority and stopOnMatch', async () => {
  const rulesDir = await createTempRulesDir();

  await writeFile(
    join(rulesDir, '001-reject.json'),
    JSON.stringify(
      {
        id: 'loan.reject.high-risk',
        priority: 1000,
        stopOnMatch: true,
        when: {
          any: [
            { fact: 'profile.creditScore', operator: 'lt', value: 550 },
            { fact: 'profile.blacklisted', operator: 'eq', value: true }
          ]
        },
        outcome: {
          action: 'REJECT',
          reasonCodes: ['CREDIT_SCORE_TOO_LOW']
        }
      },
      null,
      2
    ),
    'utf8'
  );

  await writeFile(
    join(rulesDir, '010-standard.json'),
    JSON.stringify(
      {
        id: 'loan.match.standard',
        priority: 100,
        stopOnMatch: false,
        when: {
          all: [
            { fact: 'profile.creditScore', operator: 'gte', value: 680 },
            { fact: 'profile.monthlyIncome', operator: 'gte', value: 6000 }
          ]
        },
        outcome: {
          action: 'MATCH_PRODUCT',
          payload: { productCode: 'PERSONAL_STANDARD' }
        }
      },
      null,
      2
    ),
    'utf8'
  );

  const engine = new JsonRulesEngine({ rulesDir });
  await engine.init();

  const lowScoreResult = await engine.evaluateAll({
    profile: {
      creditScore: 500,
      blacklisted: false,
      monthlyIncome: 20000
    }
  });

  assert.equal(lowScoreResult.hit, true);
  assert.equal(lowScoreResult.matches.length, 1);
  assert.equal(lowScoreResult.matches[0]?.ruleId, 'loan.reject.high-risk');
  assert.equal(lowScoreResult.matches[0]?.outcome.action, 'REJECT');

  const normalResult = await engine.evaluateAll({
    profile: {
      creditScore: 700,
      blacklisted: false,
      monthlyIncome: 8000
    }
  });

  assert.equal(normalResult.hit, true);
  assert.equal(normalResult.matches.length, 1);
  assert.equal(normalResult.matches[0]?.ruleId, 'loan.match.standard');

  await engine.close();
  await rm(rulesDir, { recursive: true, force: true });
});

test('reload should pick up updated rules', async () => {
  const rulesDir = await createTempRulesDir();
  const rulePath = join(rulesDir, '001-rule.json');

  await writeFile(
    rulePath,
    JSON.stringify(
      {
        id: 'loan.match.dynamic',
        priority: 100,
        when: { fact: 'profile.monthlyIncome', operator: 'gte', value: 5000 },
        outcome: { action: 'MATCH_PRODUCT', payload: { productCode: 'A' } }
      },
      null,
      2
    ),
    'utf8'
  );

  const engine = new JsonRulesEngine({ rulesDir });
  await engine.init();

  const first = await engine.evaluate('loan.match.dynamic', {
    profile: { monthlyIncome: 4500 }
  });
  assert.equal(first.matched, false);

  await writeFile(
    rulePath,
    JSON.stringify(
      {
        id: 'loan.match.dynamic',
        priority: 100,
        when: { fact: 'profile.monthlyIncome', operator: 'gte', value: 4000 },
        outcome: { action: 'MATCH_PRODUCT', payload: { productCode: 'B' } }
      },
      null,
      2
    ),
    'utf8'
  );

  await engine.reload();

  const second = await engine.evaluate('loan.match.dynamic', {
    profile: { monthlyIncome: 4500 }
  });
  assert.equal(second.matched, true);
  assert.equal(second.match?.outcome.payload?.productCode, 'B');

  await engine.close();
  await rm(rulesDir, { recursive: true, force: true });
});
