// Sandbox spike: proves the money path Allowance depends on before we build on it.
//   1. token         — client-credentials OAuth works
//   2. vault-start   — create a Vault v3 setup token for the buyer's PayPal wallet, print approve URL
//   3. vault-finish  — exchange the approved setup token for a reusable payment token
//   4. charge        — charge the vaulted wallet with no buyer present (what an agent payment needs)
//   5. payout        — pay a merchant via Payouts (fallback route if direct payee charging is refused)
//
// Usage: node --env-file=.env scripts/paypal-spike.mjs <step> [args]

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com';
const STATE_FILE = new URL('../.spike-state.json', import.meta.url);

const loadState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {});
const saveState = (patch) => writeFileSync(STATE_FILE, JSON.stringify({ ...loadState(), ...patch }, null, 2));

async function getAccessToken() {
  const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing from .env');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`OAuth failed (${res.status}): ${JSON.stringify(body)}`);
  return body;
}

let cachedToken;
async function paypal(method, path, payload) {
  cachedToken ??= (await getAccessToken()).access_token;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cachedToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(method === 'POST' && { 'PayPal-Request-Id': randomUUID() }),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    console.error(`✗ ${method} ${path} → ${res.status} (debug_id: ${body.debug_id ?? 'n/a'})`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
  return body;
}

const steps = {
  async token() {
    const t = await getAccessToken();
    console.log(`✓ OAuth ok — expires_in ${t.expires_in}s, app_id ${t.app_id}`);
    console.log(`  scopes include vault: ${t.scope.includes('vault')}, payouts: ${t.scope.includes('payouts')}`);
  },

  async 'vault-start'() {
    const appUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const setup = await paypal('POST', '/v3/vault/setup-tokens', {
      payment_source: {
        paypal: {
          description: 'Allowance: lets your AI agents pay within the limits you set',
          usage_type: 'MERCHANT',
          customer_type: 'CONSUMER',
          experience_context: {
            brand_name: 'Allowance',
            shipping_preference: 'NO_SHIPPING',
            return_url: `${appUrl}/vault/return`,
            cancel_url: `${appUrl}/vault/cancel`,
          },
        },
      },
    });
    saveState({ setupTokenId: setup.id });
    const approve = setup.links.find((l) => l.rel === 'approve')?.href;
    console.log(`✓ setup token ${setup.id} (${setup.status})`);
    console.log(`→ Open this, log in as the SANDBOX BUYER, and approve:\n  ${approve}`);
    console.log('  (The redirect afterwards may show an error page; that is fine.) Then run: vault-finish');
  },

  async 'vault-finish'() {
    const { setupTokenId } = loadState();
    if (!setupTokenId) throw new Error('run vault-start first');
    const token = await paypal('POST', '/v3/vault/payment-tokens', {
      payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } },
    });
    saveState({ paymentTokenId: token.id, customerId: token.customer?.id });
    console.log(`✓ payment token ${token.id} for customer ${token.customer?.id}`);
    console.log(`  payer: ${token.payment_source?.paypal?.email_address}`);
  },

  async charge(amount = '12.34', payeeEmail) {
    const { paymentTokenId } = loadState();
    if (!paymentTokenId) throw new Error('run vault-finish first');
    const order = await paypal('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `spike-${Date.now()}`,
          description: 'Allowance spike: agent purchase',
          amount: { currency_code: 'USD', value: amount },
          ...(payeeEmail && { payee: { email_address: payeeEmail } }),
        },
      ],
      payment_source: { paypal: { vault_id: paymentTokenId } },
    });
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    console.log(`✓ order ${order.id} status ${order.status}`);
    console.log(`  capture ${capture?.id} ${capture?.status} ${capture?.amount?.value} ${capture?.amount?.currency_code}`);
    console.log(`  payee: ${order.purchase_units?.[0]?.payee?.email_address}`);
    saveState({ lastCaptureId: capture?.id });
  },

  async payout(receiver = process.env.SANDBOX_MERCHANT_EMAIL, amount = '5.00') {
    if (!receiver) throw new Error('pass a receiver email or set SANDBOX_MERCHANT_EMAIL');
    const batch = await paypal('POST', '/v1/payments/payouts', {
      sender_batch_header: {
        sender_batch_id: `spike-${Date.now()}`,
        email_subject: 'You received a payment from an Allowance agent',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: { value: amount, currency: 'USD' },
          receiver,
          note: 'Allowance spike payout',
          sender_item_id: `item-${Date.now()}`,
        },
      ],
    });
    console.log(`✓ payout batch ${batch.batch_header.payout_batch_id} ${batch.batch_header.batch_status}`);
  },

  async refund() {
    const { lastCaptureId } = loadState();
    if (!lastCaptureId) throw new Error('run charge first');
    const refund = await paypal('POST', `/v2/payments/captures/${lastCaptureId}/refund`, {});
    console.log(`✓ refund ${refund.id} ${refund.status}`);
  },
};

const [step, ...args] = process.argv.slice(2);
if (!steps[step]) {
  console.log(`steps: ${Object.keys(steps).join(', ')}`);
  process.exit(1);
}
await steps[step](...args).catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
