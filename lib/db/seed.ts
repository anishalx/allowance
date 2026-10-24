import type { OpsPolicy } from '../ops/schema';
import type { Policy } from '../policy/schema';
import { generateAgentKey } from '../agents/keys';
import type { Db } from './index';
import { agents, merchants, users } from './schema';

export const DEMO_USER_ID = 'u_demo';

const merchantEmail = (envVar: string) => process.env[envVar] || process.env.SANDBOX_MERCHANT_EMAIL || 'merchant@example.com';

// The verified merchant directory. Agents name a merchant; the directory decides where money goes,
// so a hijacked agent can't redirect a payment to an address of its choosing.
const MERCHANTS = [
  {
    id: 'm_freshcart',
    name: 'FreshCart Groceries',
    domain: 'freshcart.example',
    paypalEmail: merchantEmail('MERCHANT_FRESHCART_EMAIL'),
    category: 'groceries',
    description: 'Neighborhood grocery delivery.',
  },
  {
    id: 'm_harvestlane',
    name: 'Harvest Lane Market',
    domain: 'harvestlane.example',
    paypalEmail: merchantEmail('MERCHANT_HARVESTLANE_EMAIL'),
    category: 'groceries',
    description: 'Neighborhood market, since 1998.',
  },
  {
    id: 'm_greenleaf',
    name: 'GreenLeaf Pharmacy',
    domain: 'greenleaf.example',
    paypalEmail: merchantEmail('MERCHANT_GREENLEAF_EMAIL'),
    category: 'pharmacy',
    description: 'Over-the-counter medicine and personal care.',
  },
  {
    id: 'm_pageturner',
    name: 'PageTurner Books',
    domain: 'pageturner.example',
    paypalEmail: merchantEmail('MERCHANT_PAGETURNER_EMAIL'),
    category: 'books_education',
    description: 'Ebooks, audiobooks and online courses.',
  },
  {
    id: 'm_cloudnine',
    name: 'CloudNine Software',
    domain: 'cloudnine.example',
    paypalEmail: merchantEmail('MERCHANT_CLOUDNINE_EMAIL'),
    category: 'software',
    description: 'Developer tools and API credits.',
  },
] as const;

const SAFETY_BLOCKS = ['gift_cards', 'money_transfer', 'crypto', 'gambling'] as const;

const pantryPolicy: Policy = {
  summary: 'Pantry may buy groceries and household basics, up to $60 a week, asking you about anything over $25.',
  currency: 'USD',
  limits: { perPurchaseMax: null, daily: null, weekly: 60, monthly: null },
  approval: { requireAbove: 25, newMerchants: true },
  categories: { allowed: ['groceries', 'household'], blocked: ['alcohol_tobacco', ...SAFETY_BLOCKS], approvalRequired: [], budgets: [] },
  merchants: { allowed: null, blocked: [] },
  quietHours: null,
  notes: [],
};

const scoutPolicy: Policy = {
  summary: 'Scout may buy books, courses and software up to $40 each and $120 a month, asking you before any subscription.',
  currency: 'USD',
  limits: { perPurchaseMax: 40, daily: null, weekly: null, monthly: 120 },
  approval: { requireAbove: null, newMerchants: true },
  categories: { allowed: ['books_education', 'software'], blocked: [...SAFETY_BLOCKS], approvalRequired: [], budgets: [] },
  merchants: { allowed: null, blocked: [] },
  quietHours: null,
  notes: ['Ask before starting any recurring subscription.', 'Never buy physical goods.'],
};

// Business agents operate our PayPal account; they can't buy anything themselves.
export const noPurchasesPolicy: Policy = {
  summary: 'This agent cannot make purchases.',
  currency: 'USD',
  limits: { perPurchaseMax: 0, daily: 0, weekly: 0, monthly: 0 },
  approval: { requireAbove: null, newMerchants: true },
  categories: { allowed: [], blocked: [...SAFETY_BLOCKS], approvalRequired: [], budgets: [] },
  merchants: { allowed: [], blocked: [] },
  quietHours: null,
  notes: [],
};

const helpdeskOps: OpsPolicy = {
  summary: 'Helpdesk may refund up to $25 per refund and $60 a day on recent orders, invoice existing customers up to $200, and never accept disputes.',
  refunds: { enabled: true, perRefundMax: 25, dailyMax: 60, requireAbove: null, maxOrderAgeDays: 30, fullRefundsNeedApproval: true },
  invoices: { enabled: true, perInvoiceMax: 200, dailyCount: 5, requireAbove: 100, onlyExistingCustomers: true },
  disputes: { acceptClaims: 'never' },
  notes: ['Only refund the customer who paid for the order.'],
};

const AGENTS = [
  {
    id: 'a_pantry',
    name: 'Pantry',
    role: 'Keeps our kitchen stocked: weekly groceries and basic household supplies.',
    mandateText: 'Groceries and household stuff only, up to $60 a week. Ask me for anything over $25. Never buy alcohol.',
    policy: pantryPolicy,
  },
  {
    id: 'a_scout',
    name: 'Scout',
    role: 'Research assistant: buys the ebooks, courses and software tools I need for work.',
    mandateText: 'Books, courses and software up to $40 per purchase and $120 a month. Ask me before any subscription. Never physical goods.',
    policy: scoutPolicy,
  },
  {
    id: 'a_helpdesk',
    name: 'Helpdesk',
    kind: 'business' as const,
    role: 'Customer support for our store: answers customer emails and handles refunds and invoices on our PayPal business account.',
    mandateText:
      'Refunds up to $25 each and $60 a day, only for orders from the last 30 days, and ask me before any full refund. Invoices up to $200, only to existing customers, and ask me above $100. Never accept a dispute claim.',
    policy: noPurchasesPolicy,
    opsPolicy: helpdeskOps,
  },
];

export async function seed(db: Db) {
  await db.insert(users).values({ id: DEMO_USER_ID, name: 'Demo household' }).onConflictDoNothing();
  await db.insert(merchants).values(MERCHANTS.map((m) => ({ ...m, verified: true }))).onConflictDoNothing();
  for (const a of AGENTS) {
    // A fresh key per database; rotate it in the UI to connect an external agent.
    const { hash, prefix } = generateAgentKey();
    await db.insert(agents).values({ ...a, userId: DEMO_USER_ID, apiKeyHash: hash, apiKeyPrefix: prefix }).onConflictDoNothing();
  }
}
