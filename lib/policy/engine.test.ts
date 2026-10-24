import { describe, expect, it } from 'vitest';
import { evaluate, findLookalike, inQuietHours, merchantMatches, toCents } from './engine';
import type { EngineInput, LineItem, Policy } from './schema';

const groceryPolicy: Policy = {
  summary: 'Groceries up to $60 a week, ask above $25, never gift cards.',
  currency: 'USD',
  limits: { perPurchaseMax: 80, daily: null, weekly: 60, monthly: null },
  approval: { requireAbove: 25, newMerchants: false },
  categories: { allowed: ['groceries', 'household'], blocked: ['gift_cards', 'alcohol_tobacco'], approvalRequired: [], budgets: [] },
  merchants: { allowed: null, blocked: ['sketchy.example'] },
  quietHours: null,
  notes: [],
};

const freshcart = { id: 'm_freshcart', name: 'FreshCart Groceries', domain: 'freshcart.example', category: 'groceries' as const, verified: true };
const now = new Date('2026-10-24T15:00:00Z');

function input(overrides: Partial<EngineInput> & { items?: LineItem[] } = {}): EngineInput {
  const items = overrides.items ?? [{ name: 'Oat milk', quantity: 2, unitPrice: 4.5, category: 'groceries' }];
  return {
    policy: groceryPolicy,
    merchant: freshcart,
    items,
    totalCents: items.reduce((s, i) => s + toCents(i.unitPrice) * i.quantity, 0),
    currency: 'USD',
    now,
    history: [],
    knownMerchantIds: new Set(['m_freshcart']),
    ...overrides,
  };
}

const ruleOutcome = (r: ReturnType<typeof evaluate>, rule: string) => r.checks.find((c) => c.rule === rule)?.outcome;

describe('policy engine', () => {
  it('allows a small in-scope purchase', () => {
    expect(evaluate(input()).decision).toBe('allow');
  });

  it('asks the human above the auto-approve threshold', () => {
    const r = evaluate(input({ items: [{ name: 'Weekly shop', quantity: 1, unitPrice: 34.2, category: 'groceries' }] }));
    expect(r.decision).toBe('require_approval');
    expect(ruleOutcome(r, 'approval.amount')).toBe('approval');
  });

  it('denies blocked categories even when everything else passes', () => {
    const r = evaluate(input({ items: [{ name: '$5 gift card', quantity: 1, unitPrice: 5, category: 'gift_cards' }] }));
    expect(r.decision).toBe('deny');
    expect(ruleOutcome(r, 'category.blocked')).toBe('deny');
  });

  it('denies categories outside the agent scope', () => {
    const r = evaluate(input({ items: [{ name: 'Headphones', quantity: 1, unitPrice: 20, category: 'electronics' }] }));
    expect(r.decision).toBe('deny');
    expect(ruleOutcome(r, 'category.scope')).toBe('deny');
  });

  it('denies when the stated total does not match the line items', () => {
    const r = evaluate(input({ totalCents: 900_00 }));
    expect(r.decision).toBe('deny');
    expect(ruleOutcome(r, 'cart.integrity')).toBe('deny');
  });

  it('denies once the rolling weekly limit would be exceeded', () => {
    const history = [{ amountCents: 55_00, category: 'groceries' as const, merchantId: 'm_freshcart', at: new Date('2026-10-22T10:00:00Z') }];
    const r = evaluate(input({ history }));
    expect(r.decision).toBe('deny');
    expect(ruleOutcome(r, 'limit.week')).toBe('deny');
  });

  it('ignores spend that has aged out of the rolling window', () => {
    const history = [{ amountCents: 55_00, category: 'groceries' as const, merchantId: 'm_freshcart', at: new Date('2026-10-10T10:00:00Z') }];
    expect(evaluate(input({ history })).decision).toBe('allow');
  });

  it('requires approval for unverified payees', () => {
    const merchant = { id: null, name: 'gifts-4-u', domain: null, category: 'groceries' as const, verified: false };
    const r = evaluate(input({ merchant }));
    expect(r.decision).toBe('require_approval');
    expect(ruleOutcome(r, 'merchant.unverified')).toBe('approval');
  });

  it('denies blocked merchants by domain, including subdomains', () => {
    const merchant = { ...freshcart, id: 'm_x', name: 'Totally Legit', domain: 'https://shop.sketchy.example/cart' };
    expect(evaluate(input({ merchant })).decision).toBe('deny');
  });

  it('asks on first purchase from a merchant when configured', () => {
    const policy = { ...groceryPolicy, approval: { requireAbove: null, newMerchants: true } };
    const r = evaluate(input({ policy, knownMerchantIds: new Set() }));
    expect(r.decision).toBe('require_approval');
    expect(ruleOutcome(r, 'merchant.new')).toBe('approval');
  });

  it('enforces per-category budgets only against matching items', () => {
    const policy: Policy = {
      ...groceryPolicy,
      categories: { ...groceryPolicy.categories, budgets: [{ category: 'household', period: 'week', max: 10 }] },
    };
    const items: LineItem[] = [
      { name: 'Apples', quantity: 1, unitPrice: 6, category: 'groceries' },
      { name: 'Dish soap', quantity: 3, unitPrice: 4, category: 'household' },
    ];
    const r = evaluate(input({ policy, items }));
    expect(r.decision).toBe('deny');
    expect(ruleOutcome(r, 'budget.household')).toBe('deny');
  });

  it('deny beats approval when several rules fire', () => {
    const r = evaluate(input({ items: [{ name: 'Gift card bundle', quantity: 1, unitPrice: 500, category: 'gift_cards' }] }));
    expect(r.decision).toBe('deny');
    expect(r.checks.some((c) => c.outcome === 'approval')).toBe(true);
  });
});

describe('merchantMatches', () => {
  it('matches the way people name stores', () => {
    expect(merchantMatches('FreshCart', 'FreshCart Groceries', 'freshcart.example')).toBe(true);
    expect(merchantMatches('freshcart.example', 'FreshCart Groceries', 'freshcart.example')).toBe(true);
    expect(merchantMatches('Fresh Cart', 'FreshCart Groceries', 'freshcart.example')).toBe(true);
    expect(merchantMatches('Corner Market', 'The Corner Market', null)).toBe(true);
  });

  it('does not match partial words or other stores', () => {
    expect(merchantMatches('Fresh', 'FreshCart Groceries', 'freshcart.example')).toBe(false);
    expect(merchantMatches('Corner Market', 'FreshCart Groceries', 'freshcart.example')).toBe(false);
    expect(merchantMatches('cart.example', 'FreshCart Groceries', 'freshcart.example')).toBe(false);
  });
});

describe('payment redirection', () => {
  const directory = [
    { name: 'FreshCart Groceries', domain: 'freshcart.example' },
    { name: 'Harvest Lane Market', domain: 'harvestlane.example' },
  ];

  it('spots payees that borrow a verified merchant’s name, domain or email', () => {
    expect(findLookalike({ name: 'HarvestLane Pay', domain: null, email: 'billing@harvestlane-pay.example' }, directory)).toBe('Harvest Lane Market');
    expect(findLookalike({ name: 'FreshCart Pay', domain: null, email: null }, directory)).toBe('FreshCart Groceries');
    expect(findLookalike({ name: 'Payments Desk', domain: null, email: 'ops@freshcart-checkout.example' }, directory)).toBe('FreshCart Groceries');
  });

  it('does not flag unrelated payees or generic words', () => {
    expect(findLookalike({ name: 'Corner Bakery', domain: null, email: 'hello@cornerbakery.example' }, directory)).toBeNull();
    expect(findLookalike({ name: 'Grocery Market Pay', domain: null, email: null }, directory)).toBeNull();
  });

  it('asks the human about a lookalike payee', () => {
    const merchant = { id: null, name: 'HarvestLane Pay', domain: null, category: 'groceries' as const, verified: false, lookalikeOf: 'Harvest Lane Market' };
    const r = evaluate(input({ merchant }));
    expect(r.decision).toBe('require_approval');
    expect(ruleOutcome(r, 'merchant.lookalike')).toBe('approval');
  });

  it('flags an agent trying to override a verified merchant’s payee', () => {
    const r = evaluate(input({ merchant: { ...freshcart, requestedPayee: 'billing@freshcart-pay.example' } }));
    expect(r.decision).toBe('require_approval');
    expect(ruleOutcome(r, 'merchant.payeeOverride')).toBe('approval');
  });
});

describe('quiet hours', () => {
  it('handles windows that cross midnight', () => {
    // 03:30 in New York
    expect(inQuietHours(new Date('2026-10-24T07:30:00Z'), '22:00', '07:00', 'America/New_York')).toBe(true);
    // 15:00 in New York
    expect(inQuietHours(new Date('2026-10-24T19:00:00Z'), '22:00', '07:00', 'America/New_York')).toBe(false);
  });
});
