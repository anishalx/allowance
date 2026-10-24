import { compileMandate } from '../lib/ai/compiler';
import { evaluate } from '../lib/policy/engine';

const t0 = Date.now();
const out = await compileMandate({
  agentName: 'Pantry',
  agentRole: 'Keeps our kitchen stocked: weekly groceries and basic household supplies.',
  text: 'Groceries and household stuff only, up to $60 a week. Ask me for anything over $25. Never buy alcohol. Only FreshCart or Corner Market.',
  timezone: 'America/New_York',
});
console.log(`compiled in ${Date.now() - t0}ms`);
console.log(JSON.stringify(out, null, 2));
const r = evaluate({
  policy: out.policy,
  merchant: { id: 'm1', name: 'FreshCart Groceries', domain: 'freshcart.example', category: 'groceries', verified: true },
  items: [{ name: 'Gift card', quantity: 1, unitPrice: 20, category: 'gift_cards' }],
  totalCents: 2000, currency: 'USD', now: new Date(), history: [], knownMerchantIds: new Set(['m1']),
});
console.log('gift card on FreshCart →', r.decision, r.checks.filter(c => c.outcome !== 'pass').map(c => c.rule));
