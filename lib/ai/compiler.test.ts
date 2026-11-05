import { describe, expect, it } from 'vitest';
import type { Policy } from '../policy/schema';
import { withSafetyDefaults, type CompiledMandate } from './compiler';

const compiled = (patch: Partial<Policy['categories']> = {}, limits: Partial<Policy['limits']> = {}, requireAbove: number | null = 25): CompiledMandate => ({
  policy: {
    summary: 'Groceries only.',
    currency: 'USD',
    limits: { perPurchaseMax: null, daily: null, weekly: 60, monthly: null, ...limits },
    approval: { requireAbove, newMerchants: true },
    categories: { allowed: ['groceries'], blocked: ['alcohol_tobacco'], approvalRequired: [], budgets: [], ...patch },
    merchants: { allowed: null, blocked: [] },
    quietHours: null,
    notes: [],
  },
  interpretation: [],
  safetyDefaults: [],
  ambiguities: [],
});

describe('compiler safety defaults', () => {
  it('blocks every cash-equivalent the model forgot', () => {
    const out = withSafetyDefaults(compiled());
    expect(out.policy.categories.blocked).toEqual(['alcohol_tobacco', 'gift_cards', 'money_transfer', 'crypto', 'gambling']);
    expect(out.safetyDefaults).toHaveLength(4);
  });

  it('respects a category the human explicitly allowed', () => {
    const out = withSafetyDefaults(compiled({ allowed: ['gift_cards'], blocked: [] }));
    expect(out.policy.categories.blocked).not.toContain('gift_cards');
    expect(out.policy.categories.blocked).toContain('crypto');
  });

  it('adds an approval threshold when there is no cap at all', () => {
    expect(withSafetyDefaults(compiled({}, {}, null)).policy.approval.requireAbove).toBe(50);
    expect(withSafetyDefaults(compiled({}, { perPurchaseMax: 30 }, null)).policy.approval.requireAbove).toBeNull();
  });

  it('changes nothing when the model already applied the defaults', () => {
    const done = compiled({ blocked: ['gift_cards', 'money_transfer', 'crypto', 'gambling'] });
    expect(withSafetyDefaults(done)).toBe(done);
  });
});
