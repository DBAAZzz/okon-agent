# @okon/rule

JSON 文件驱动的规则引擎核心模块，支持：

- 启动加载规则目录
- 按 `id` 单规则评估
- 全量规则评估（按 `priority` 排序）
- `stopOnMatch` 提前停止
- 文件变更热重载（`watch: true`）
- Fastify 插件（`fastify.rulesEngine`）
- 贷款产品建模类型（`LoanProduct`）

## 目录结构

```text
packages/rule
├── rules/                    # 规则 JSON
├── src/
│   ├── core/                 # 引擎核心
│   ├── fastify/              # Fastify 插件
│   ├── models/               # 业务模型
│   └── index.ts              # 包导出
└── tests/                    # 单元测试
```

## 规则文件格式

```json
{
  "id": "loan.product.salaried-gjj-standard",
  "name": "工薪公积金标准贷",
  "institution": "华夏消费金融",
  "amountRange": [30000, 200000],
  "termRange": [12, 36],
  "rateRange": [7.2, 14.8],
  "repaymentMethods": ["等额本息", "先息后本"],
  "rules": {
    "minAge": 22,
    "maxAge": 60,
    "maxAgeFemale": 55,
    "requireMainlandHukou": true,
    "requireQualifiedEmployer": true,
    "minEducation": "大专",
    "maxQueryCount1M": 2,
    "maxQueryCount2M": 4,
    "maxQueryCount3M": 6,
    "maxQueryCount6M": 10,
    "noCurrentOverdue": true,
    "allowedIdentities": ["上班族", "自由职业"],
    "requireGJJ": true,
    "minGJJBase": 4000,
    "minGJJMonths": 12,
    "requireShebao": true,
    "minShebaoMonths": 12,
    "minShebaoBase": 4500,
    "maxCreditCards": 8,
    "maxUnsettledCreditLoans": 3,
    "maxInstitutions": 5,
    "maxNonBankInstitutions": 2,
    "noOutstandingMicroLoan": true,
    "maxTotalCreditLimit": 180,
    "minSalary": 6000,
    "allowedCities": ["北京", "上海", "深圳", "杭州"]
  },
  "fullRuleText": "产品规则原文……",
  "bonuses": {
    "hasProperty": "额度上浮20%",
    "hasGJJ": "利率下调0.5%"
  }
}
```

说明：引擎会把 `LoanProduct` 自动转换为内部规则（`RuleDefinition`）执行。若你已有 `when/outcome` 结构，也仍然支持。

## Fastify 注册示例

```ts
import Fastify from 'fastify';
import rulesEnginePlugin from '@okon/rule';
import { join } from 'node:path';

const app = Fastify();

await app.register(rulesEnginePlugin, {
  rulesDir: join(process.cwd(), 'packages/rule/rules'),
  watch: true
});
```

## 使用示例

```ts
const result = await app.rulesEngine.evaluateAll({
  credit: {
    queryCount1M: 1,
    queryCount2M: 2,
    queryCount3M: 3,
    queryCount6M: 8,
    currentOverdue: false,
    creditUsage: 0.45,
    creditCards: 4,
    unsettledCreditLoans: 1,
    institutions: 2,
    nonBankInstitutions: 1,
    outstandingMicroLoan: false,
    totalCreditLimitWan: 120
  },
  profile: {
    identity: '上班族',
    gender: 'male',
    education: '本科',
    age: 28,
    city: '上海',
    mainlandHukou: true,
    qualifiedEmployer: true,
    monthlyIncome: 15000,
    hasGJJ: true,
    gjjBase: 6000,
    gjjMonths: 24,
    hasShebao: true,
    shebaoBase: 6000,
    shebaoMonths: 24
  },
  business: {
    hasBizLicense: false,
    bizAgeMonths: 0
  }
});
```

## 产品建模类型

`LoanProduct` 定义位置：`src/models/loan-product.ts`

## 支持的默认操作符

`eq` `neq` `gt` `gte` `lt` `lte` `in` `notIn` `between` `contains` `startsWith` `endsWith` `regex` `educationGte` `exists` `notExists` `truthy` `falsy`
