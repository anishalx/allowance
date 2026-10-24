import { z } from 'zod';

// A fixed taxonomy so the engine can compare categories exactly; the LLM maps free text onto it.
export const CATEGORIES = [
  'groceries',
  'restaurants',
  'household',
  'personal_care',
  'pharmacy',
  'clothing',
  'electronics',
  'software',
  'travel',
  'transport',
  'entertainment',
  'books_education',
  'gifts',
  'gift_cards',
  'alcohol_tobacco',
  'gambling',
  'crypto',
  'money_transfer',
  'donations',
  'utilities',
  'home_services',
  'pets',
  'office_supplies',
  'other',
] as const;

export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

const Dollars = z.number().nonnegative();

export const Period = z.enum(['day', 'week', 'month']);
export type Period = z.infer<typeof Period>;

// Every field is required (nullable instead of optional) so the schema doubles as an
// OpenAI strict structured-output format.
export const Policy = z.object({
  summary: z.string().describe('One sentence, plain English, describing what this agent may do.'),
  currency: z.literal('USD'),
  limits: z.object({
    perPurchaseMax: Dollars.nullable().describe('Hard cap for a single purchase. null = no cap.'),
    daily: Dollars.nullable().describe('Max total spend in any rolling 24 hours. null = no cap.'),
    weekly: Dollars.nullable().describe('Max total spend in any rolling 7 days. null = no cap.'),
    monthly: Dollars.nullable().describe('Max total spend in any rolling 30 days. null = no cap.'),
  }),
  approval: z.object({
    requireAbove: Dollars.nullable().describe('Ask the human for purchases above this amount. null = never by amount.'),
    newMerchants: z.boolean().describe('Ask the human the first time the agent pays a merchant.'),
  }),
  categories: z.object({
    allowed: z.array(Category).nullable().describe('If set, the agent may only buy these categories.'),
    blocked: z.array(Category).describe('Never allowed, even with approval.'),
    approvalRequired: z.array(Category).describe('Always ask the human for these categories.'),
    budgets: z
      .array(z.object({ category: Category, period: Period, max: Dollars }))
      .describe('Per-category spending caps.'),
  }),
  merchants: z.object({
    allowed: z.array(z.string()).nullable().describe('If set, the agent may only pay these merchants (names or domains).'),
    blocked: z.array(z.string()).describe('Merchants (names or domains) the agent may never pay.'),
  }),
  quietHours: z
    .object({
      start: z.string().describe('24h local time HH:MM'),
      end: z.string().describe('24h local time HH:MM'),
      timezone: z.string().describe('IANA timezone, e.g. America/New_York'),
      action: z.enum(['require_approval', 'deny']),
    })
    .nullable(),
  notes: z
    .array(z.string())
    .describe('Instructions that cannot be expressed in the fields above. The AI auditor weighs these; the engine does not.'),
});
export type Policy = z.infer<typeof Policy>;

export const LineItem = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: Dollars,
  category: Category,
});
export type LineItem = z.infer<typeof LineItem>;

export type MerchantRef = {
  id: string | null; // null when the agent names a payee that isn't in the merchant directory
  name: string;
  domain: string | null;
  category: Category;
  verified: boolean;
};

export type SpendRecord = {
  amountCents: number;
  category: Category;
  merchantId: string | null;
  at: Date;
};

export type EngineInput = {
  policy: Policy;
  merchant: MerchantRef;
  items: LineItem[];
  totalCents: number;
  currency: string;
  now: Date;
  history: SpendRecord[]; // executed purchases for this agent, any age; the engine windows them
  knownMerchantIds: Set<string>; // merchants this agent has successfully paid before
};

export type Outcome = 'pass' | 'approval' | 'deny';
export type Check = { rule: string; outcome: Outcome; detail: string };
export type Decision = 'allow' | 'require_approval' | 'deny';
export type EngineResult = { decision: Decision; checks: Check[] };
