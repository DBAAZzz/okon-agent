// 客户身份
export type CustomerIdentity = '上班族' | '个体户' | '企业主' | '自由职业' | (string & {});

// 还款方式
export type RepaymentMethod =
  | '等额本息'
  | '先息后本'
  | '随借随还'
  | '等本等息'
  | (string & {});

// 学历
export type Education = '高中以下' | '大专' | '本科' | '硕士' | '博士' | (string & {});

// 性别
export type Gender = 'male' | 'female';

export interface LoanProductRules {
  // ========== 年龄 ==========
  minAge?: number;
  maxAge?: number;
  // 如果男女年龄限制不同，用这个覆盖 maxAge
  maxAgeFemale?: number;

  // ========== 地域 & 户籍 ==========
  allowedCities?: string[];
  // 户籍要求：mainland=大陆户籍
  requireMainlandHukou?: boolean;

  // ========== 客群 ==========
  allowedIdentities?: CustomerIdentity[];
  // 是否要求特定优质单位（公务员/事业单位/九大行业/上市公司/国企等）
  requireQualifiedEmployer?: boolean;

  // ========== 学历 ==========
  minEducation?: Education;

  // ========== 公积金 ==========
  requireGJJ?: boolean;
  minGJJBase?: number;
  minGJJMonths?: number;

  // ========== 社保 ==========
  requireShebao?: boolean;
  minShebaoMonths?: number;
  minShebaoBase?: number;

  // ========== 收入 ==========
  minSalary?: number;

  // ========== 资产 ==========
  requireProperty?: boolean;
  requireCar?: boolean;

  // ========== 营业执照 ==========
  requireBizLicense?: boolean;
  minBizAge?: number;

  // ========== 征信-查询次数 ==========
  maxQueryCount1M?: number;
  maxQueryCount2M?: number;
  maxQueryCount3M?: number;
  maxQueryCount6M?: number;

  // ========== 征信-逾期（粗筛） ==========
  noCurrentOverdue?: boolean;

  // ========== 征信-负债（粗筛） ==========
  maxCreditUsage?: number;
  maxCreditCards?: number;
  maxUnsettledCreditLoans?: number;
  maxInstitutions?: number;
  maxNonBankInstitutions?: number;
  noOutstandingMicroLoan?: boolean;
  // 单位：万
  maxTotalCreditLimit?: number;
}

export interface LoanProduct {
  id: string;
  name: string;
  institution: string;

  // 产品属性
  amountRange: [number, number];
  termRange: [number, number];
  rateRange: [number, number];
  repaymentMethods: RepaymentMethod[];

  // 第一层：快速过滤规则
  rules: LoanProductRules;

  // 第二层：产品规则原文（可给 LLM）
  fullRuleText: string;

  // 非硬性加分项
  bonuses?: Record<string, string>;
}
