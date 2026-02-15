import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { JsonRulesEngine } from '../src/core/engine.js';

async function createTempRulesDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'okon-loan-product-rules-'));
}

test('loan product json should be converted to executable rule', async () => {
  const rulesDir = await createTempRulesDir();

  await writeFile(
    join(rulesDir, '001-product.json'),
    JSON.stringify(
      {
        id: 'loan.product.test-standard',
        name: '测试标准贷',
        institution: '测试银行',
        amountRange: [50000, 200000],
        termRange: [12, 36],
        rateRange: [7.8, 14.2],
        repaymentMethods: ['等额本息'],
        rules: {
          maxQueryCount1M: 2,
          maxQueryCount2M: 3,
          noCurrentOverdue: true,
          maxCreditUsage: 0.7,
          maxCreditCards: 8,
          maxUnsettledCreditLoans: 3,
          maxInstitutions: 4,
          maxNonBankInstitutions: 2,
          noOutstandingMicroLoan: true,
          maxTotalCreditLimit: 200,
          allowedIdentities: ['上班族'],
          minEducation: '大专',
          requireMainlandHukou: true,
          minSalary: 7000,
          minAge: 22,
          maxAge: 55
        },
        fullRuleText: '测试规则原文',
        bonuses: {
          hasProperty: '额度上浮20%'
        }
      },
      null,
      2
    ),
    'utf8'
  );

  const engine = new JsonRulesEngine({ rulesDir });
  await engine.init();

  assert.equal(engine.hasRule('loan.product.test-standard'), true);

  const passResult = await engine.evaluate('loan.product.test-standard', {
    credit: {
      queryCount1M: 1,
      queryCount2M: 2,
      currentOverdue: false,
      creditUsage: 0.5,
      creditCards: 4,
      unsettledCreditLoans: 1,
      institutions: 2,
      nonBankInstitutions: 1,
      outstandingMicroLoan: false,
      totalCreditLimitWan: 120
    },
    profile: {
      identity: '上班族',
      education: '本科',
      mainlandHukou: true,
      monthlyIncome: 9000,
      age: 30
    }
  });

  assert.equal(passResult.matched, true);
  assert.equal(passResult.match?.outcome.action, 'MATCH_PRODUCT');
  assert.equal(
    (passResult.match?.outcome.payload?.product as { id?: string } | undefined)?.id,
    'loan.product.test-standard'
  );

  const rejectResult = await engine.evaluate('loan.product.test-standard', {
    credit: {
      queryCount1M: 1,
      queryCount2M: 6,
      currentOverdue: false,
      creditUsage: 0.5,
      creditCards: 4,
      unsettledCreditLoans: 1,
      institutions: 2,
      nonBankInstitutions: 1,
      outstandingMicroLoan: false,
      totalCreditLimitWan: 120
    },
    profile: {
      identity: '上班族',
      education: '本科',
      mainlandHukou: true,
      monthlyIncome: 9000,
      age: 30
    }
  });

  assert.equal(rejectResult.matched, false);

  await engine.close();
  await rm(rulesDir, { recursive: true, force: true });
});
