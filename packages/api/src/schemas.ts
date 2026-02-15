import { z } from 'zod';

export const creditFactsSchema = z
  .object({
    queryCount1M: z.number().int().nonnegative().optional(),
    queryCount2M: z.number().int().nonnegative().optional(),
    queryCount3M: z.number().int().nonnegative().optional(),
    queryCount6M: z.number().int().nonnegative().optional(),
    currentOverdue: z.boolean().optional(),
    creditUsage: z.number().nonnegative().optional(),
    creditCards: z.number().int().nonnegative().optional(),
    unsettledCreditLoans: z.number().int().nonnegative().optional(),
    institutions: z.number().int().nonnegative().optional(),
    nonBankInstitutions: z.number().int().nonnegative().optional(),
    outstandingMicroLoan: z.boolean().optional(),
    totalCreditLimitWan: z.number().nonnegative().optional()
  })
  .strict();

export const profileFactsSchema = z
  .object({
    identity: z.string().min(1).optional(),
    gender: z.enum(['male', 'female']).optional(),
    education: z.string().min(1).optional(),
    mainlandHukou: z.boolean().optional(),
    qualifiedEmployer: z.boolean().optional(),
    hasProperty: z.boolean().optional(),
    hasCar: z.boolean().optional(),
    hasGJJ: z.boolean().optional(),
    hasShebao: z.boolean().optional(),
    gjjBase: z.number().nonnegative().optional(),
    gjjMonths: z.number().int().nonnegative().optional(),
    shebaoBase: z.number().nonnegative().optional(),
    shebaoMonths: z.number().int().nonnegative().optional(),
    monthlyIncome: z.number().nonnegative().optional(),
    age: z.number().int().nonnegative().optional(),
    city: z.string().min(1).optional()
  })
  .strict();

export const businessFactsSchema = z
  .object({
    hasBizLicense: z.boolean().optional(),
    bizAgeMonths: z.number().int().nonnegative().optional()
  })
  .strict();

export const userFactsSchema = z
  .object({
    credit: creditFactsSchema.default({}),
    profile: profileFactsSchema.default({}),
    business: businessFactsSchema.default({})
  })
  .strict();

export const partialUserFactsSchema = z
  .object({
    credit: creditFactsSchema.optional(),
    profile: profileFactsSchema.optional(),
    business: businessFactsSchema.optional()
  })
  .strict();

export const createIntakeSchema = z
  .object({
    facts: partialUserFactsSchema.default({}),
    meta: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const updateIntakeSchema = z
  .object({
    facts: partialUserFactsSchema,
    meta: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const matchDirectSchema = z
  .object({
    facts: userFactsSchema
  })
  .strict();

export type UserFacts = z.infer<typeof userFactsSchema>;
export type PartialUserFacts = z.infer<typeof partialUserFactsSchema>;
export type CreateIntakeInput = z.infer<typeof createIntakeSchema>;
export type UpdateIntakeInput = z.infer<typeof updateIntakeSchema>;
export type MatchDirectInput = z.infer<typeof matchDirectSchema>;
