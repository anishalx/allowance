import type { Category, Check, Decision, EngineInput, EngineResult, Outcome, Period, SpendRecord } from './schema';

// The deterministic half of Allowance. No model output can loosen what this returns:
// the AI auditor runs afterwards and may only escalate (allow → approval → deny).

const PERIOD_MS: Record<Period, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export const toCents = (dollars: number) => Math.round(dollars * 100);
export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const SEVERITY: Record<Outcome, number> = { pass: 0, approval: 1, deny: 2 };
const DECISION_FOR: Record<Outcome, Decision> = { pass: 'allow', approval: 'require_approval', deny: 'deny' };

export function strictest(outcomes: Outcome[]): Outcome {
  return outcomes.reduce<Outcome>((worst, o) => (SEVERITY[o] > SEVERITY[worst] ? o : worst), 'pass');
}

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// People write "FreshCart" for "FreshCart Groceries" or "freshcart.example", so an entry matches when its
// words appear as a contiguous run in the merchant name, or it names the domain (or a parent domain).
export function merchantMatches(entry: string, name: string, domain: string | null) {
  const e = normalize(entry);
  if (!e) return false;
  const entryWords = words(entry);
  const nameWords = words(name);
  if (entryWords.length && nameWords.some((_, i) => entryWords.every((w, j) => nameWords[i + j] === w))) return true;
  if (!domain) return false;
  const d = normalize(domain);
  if (d === e || d.endsWith(`.${e}`)) return true;
  return entryWords.join('') === d.split('.')[0]; // "Fresh Cart" ↔ freshcart.example
}

// Words that say nothing about *which* business it is, so they can't make two names look alike.
const GENERIC_WORDS = new Set([
  'pay', 'payment', 'payments', 'checkout', 'billing', 'partner', 'partners', 'official', 'online', 'support', 'team', 'desk',
  'market', 'markets', 'store', 'stores', 'shop', 'shops', 'groceries', 'grocery', 'books', 'software', 'pharmacy',
  'the', 'and', 'inc', 'llc', 'ltd', 'example', 'com', 'net', 'org', 'www', 'mail',
]);
const distinctiveWords = (s: string) => words(s).filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));

// Payment-redirection detector: does an unknown payee borrow a verified merchant's distinctive name
// ("HarvestLane Pay", billing@harvestlane-pay.example)? Returns that merchant's name, or null.
export function findLookalike(
  payee: { name: string; domain: string | null; email: string | null },
  directory: { name: string; domain: string }[],
) {
  const candidate = words([payee.name, payee.domain ?? '', payee.email ?? ''].join(' '));
  const compact = candidate.join('');
  for (const m of directory) {
    const marks = [...new Set([...distinctiveWords(m.name), ...distinctiveWords(m.domain.split('.')[0])])];
    if (marks.some((mark) => candidate.some((w) => w.includes(mark)) || compact.includes(mark))) return m.name;
  }
  return null;
}

function spentInWindow(history: SpendRecord[], now: Date, period: Period, category?: Category) {
  const since = now.getTime() - PERIOD_MS[period];
  return history
    .filter((h) => h.at.getTime() > since && (!category || h.category === category))
    .reduce((sum, h) => sum + h.amountCents, 0);
}

function localMinutes(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function inQuietHours(now: Date, start: string, end: string, timezone: string) {
  const t = localMinutes(now, timezone);
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  return s <= e ? t >= s && t < e : t >= s || t < e; // second branch handles windows that cross midnight
}

export function evaluate(input: EngineInput): EngineResult {
  const { policy, merchant, items, totalCents, currency, now, history, knownMerchantIds } = input;
  const checks: Check[] = [];
  const add = (rule: string, outcome: Outcome, detail: string) => checks.push({ rule, outcome, detail });

  // Integrity: the agent's arithmetic must match its own cart, or something is tampering with it.
  const itemsCents = items.reduce((sum, i) => sum + toCents(i.unitPrice) * i.quantity, 0);
  if (items.length === 0) add('cart.integrity', 'deny', 'Payment request has no line items.');
  else if (itemsCents !== totalCents)
    add('cart.integrity', 'deny', `Total ${formatUsd(totalCents)} does not match line items ${formatUsd(itemsCents)}.`);
  else add('cart.integrity', 'pass', `Total matches ${items.length} line item(s).`);

  if (currency !== policy.currency) add('currency', 'deny', `Currency ${currency} is not allowed (${policy.currency} only).`);

  // Merchant rules
  if (policy.merchants.blocked.some((m) => merchantMatches(m, merchant.name, merchant.domain)))
    add('merchant.blocked', 'deny', `${merchant.name} is on the blocked list.`);
  if (policy.merchants.allowed && !policy.merchants.allowed.some((m) => merchantMatches(m, merchant.name, merchant.domain)))
    add('merchant.allowlist', 'deny', `${merchant.name} is not one of the allowed merchants.`);
  if (!merchant.verified && merchant.lookalikeOf)
    add('merchant.lookalike', 'approval', `"${merchant.name}" looks like ${merchant.lookalikeOf} but would pay a different PayPal account: a classic payment-redirection pattern.`);
  if (merchant.verified && merchant.requestedPayee)
    add('merchant.payeeOverride', 'approval', `The agent asked to pay ${merchant.requestedPayee} instead of ${merchant.name}'s verified PayPal account. Allowance only ever pays the verified account.`);
  if (!merchant.verified)
    add('merchant.unverified', 'approval', `${merchant.name} is not a verified merchant, so the payee can't be trusted automatically.`);
  else if (policy.approval.newMerchants && (!merchant.id || !knownMerchantIds.has(merchant.id)))
    add('merchant.new', 'approval', `First purchase from ${merchant.name}.`);

  // Category rules: the merchant's category and every line item's category must pass.
  const categories = [...new Set<Category>([merchant.category, ...items.map((i) => i.category)])];
  const blocked = categories.filter((c) => policy.categories.blocked.includes(c));
  if (blocked.length) add('category.blocked', 'deny', `Blocked category: ${blocked.join(', ')}.`);
  const outOfScope = policy.categories.allowed ? categories.filter((c) => !policy.categories.allowed!.includes(c)) : [];
  if (outOfScope.length) add('category.scope', 'deny', `Outside this agent's allowed categories: ${outOfScope.join(', ')}.`);
  const needsApproval = categories.filter((c) => policy.categories.approvalRequired.includes(c));
  if (needsApproval.length) add('category.approval', 'approval', `Always ask for: ${needsApproval.join(', ')}.`);

  // Amount limits
  const { limits } = policy;
  if (limits.perPurchaseMax !== null && totalCents > toCents(limits.perPurchaseMax))
    add('limit.perPurchase', 'deny', `${formatUsd(totalCents)} exceeds the ${formatUsd(toCents(limits.perPurchaseMax))} per-purchase cap.`);

  for (const period of ['day', 'week', 'month'] as const) {
    const cap = { day: limits.daily, week: limits.weekly, month: limits.monthly }[period];
    if (cap === null) continue;
    const spent = spentInWindow(history, now, period);
    const remaining = toCents(cap) - spent;
    if (totalCents > remaining)
      add(`limit.${period}`, 'deny', `Only ${formatUsd(Math.max(remaining, 0))} left of the ${formatUsd(toCents(cap))} ${period}ly limit.`);
    else add(`limit.${period}`, 'pass', `${formatUsd(remaining - totalCents)} of ${formatUsd(toCents(cap))} ${period}ly limit left after this.`);
  }

  for (const budget of policy.categories.budgets) {
    const cartCents = items
      .filter((i) => i.category === budget.category)
      .reduce((sum, i) => sum + toCents(i.unitPrice) * i.quantity, 0);
    if (!cartCents) continue;
    const remaining = toCents(budget.max) - spentInWindow(history, now, budget.period, budget.category);
    if (cartCents > remaining)
      add(`budget.${budget.category}`, 'deny', `Only ${formatUsd(Math.max(remaining, 0))} left of the ${budget.category} ${budget.period}ly budget.`);
  }

  if (policy.approval.requireAbove !== null && totalCents > toCents(policy.approval.requireAbove))
    add('approval.amount', 'approval', `Above the ${formatUsd(toCents(policy.approval.requireAbove))} auto-approve threshold.`);

  const quiet = policy.quietHours;
  if (quiet && inQuietHours(now, quiet.start, quiet.end, quiet.timezone))
    add('schedule.quietHours', quiet.action === 'deny' ? 'deny' : 'approval', `Inside quiet hours (${quiet.start}–${quiet.end} ${quiet.timezone}).`);

  return { decision: DECISION_FOR[strictest(checks.map((c) => c.outcome))], checks };
}
