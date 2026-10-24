import { centsToValue, paypal } from './client';
import type { Link, Order, PayoutBatch, Transaction } from './types';

// Thin, typed wrappers over the PayPal REST calls Allowance makes. Vault and Payouts aren't in
// @paypal/agent-toolkit, so everything goes through the same hardened client.


// ── Vault v3: save the buyer's PayPal wallet once, with their consent ──────────────────────

export async function createVaultSetupToken(opts: { returnUrl: string; cancelUrl: string }) {
  const res = await paypal<{ id: string; status: string; links: Link[] }>('POST', '/v3/vault/setup-tokens', {
    body: {
      payment_source: {
        paypal: {
          description: 'Allowance: lets your AI agents pay within the limits you set',
          usage_type: 'MERCHANT',
          customer_type: 'CONSUMER',
          experience_context: {
            brand_name: 'Allowance',
            shipping_preference: 'NO_SHIPPING',
            return_url: opts.returnUrl,
            cancel_url: opts.cancelUrl,
          },
        },
      },
    },
  });
  const approveUrl = res.links.find((l) => l.rel === 'approve')?.href;
  if (!approveUrl) throw new Error('PayPal returned no approve link for the setup token');
  return { setupTokenId: res.id, approveUrl };
}

export async function createVaultPaymentToken(setupTokenId: string) {
  const res = await paypal<{ id: string; customer: { id: string }; payment_source: { paypal?: { email_address?: string } } }>(
    'POST',
    '/v3/vault/payment-tokens',
    { body: { payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } }, idempotencyKey: `pt-${setupTokenId}` },
  );
  return { paymentTokenId: res.id, customerId: res.customer.id, payerEmail: res.payment_source.paypal?.email_address ?? null };
}

export const deleteVaultPaymentToken = (paymentTokenId: string) => paypal('DELETE', `/v3/vault/payment-tokens/${paymentTokenId}`);

// ── Orders v2: charge the saved wallet with no buyer present ───────────────────────────────

export type ChargeItem = { name: string; quantity: number; unitPriceCents: number };

export async function chargeVaultedWallet(opts: {
  paymentTokenId: string;
  requestId: string; // our payment-request id; doubles as idempotency key and invoice_id
  amountCents: number;
  description: string;
  items: ChargeItem[];
}) {
  const money = (cents: number) => ({ currency_code: 'USD', value: centsToValue(cents) });
  const order = await paypal<Order>('POST', '/v2/checkout/orders', {
    idempotencyKey: `charge-${opts.requestId}`,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: opts.requestId,
          custom_id: opts.requestId,
          invoice_id: opts.requestId,
          description: opts.description.slice(0, 127),
          amount: { ...money(opts.amountCents), breakdown: { item_total: money(opts.amountCents) } },
          items: opts.items.map((i) => ({
            name: i.name.slice(0, 127),
            quantity: String(i.quantity),
            unit_amount: money(i.unitPriceCents),
            category: 'PHYSICAL_GOODS',
          })),
        },
      ],
      payment_source: { paypal: { vault_id: opts.paymentTokenId } },
    },
  });
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    orderId: order.id,
    orderStatus: order.status,
    captureId: capture?.id,
    captureStatus: capture?.status,
  };
}

export async function refundCapture(opts: { captureId: string; requestId: string; amountCents?: number; note: string }) {
  const res = await paypal<{ id: string; status: string }>('POST', `/v2/payments/captures/${opts.captureId}/refund`, {
    idempotencyKey: `refund-${opts.requestId}`,
    body: {
      ...(opts.amountCents !== undefined && { amount: { currency_code: 'USD', value: centsToValue(opts.amountCents) } }),
      note_to_payer: opts.note.slice(0, 255),
    },
  });
  return { refundId: res.id, status: res.status };
}

// ── Payouts: settle the merchant ───────────────────────────────────────────────────────────

export async function payMerchant(opts: { requestId: string; email: string; amountCents: number; note: string }) {
  const res = await paypal<{ batch_header: { payout_batch_id: string; batch_status: string } }>('POST', '/v1/payments/payouts', {
    idempotencyKey: `payout-${opts.requestId}`,
    body: {
      sender_batch_header: {
        sender_batch_id: `payout-${opts.requestId}`,
        email_subject: 'You received a payment from an Allowance agent',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          receiver: opts.email,
          amount: { currency: 'USD', value: centsToValue(opts.amountCents) },
          note: opts.note.slice(0, 4000),
          sender_item_id: opts.requestId,
        },
      ],
    },
  });
  return { batchId: res.batch_header.payout_batch_id, batchStatus: res.batch_header.batch_status };
}

export async function getPayoutBatch(batchId: string) {
  const res = await paypal<PayoutBatch>('GET', `/v1/payments/payouts/${batchId}`);
  const item = res.items?.[0];
  return {
    batchStatus: res.batch_header?.batch_status,
    itemId: item?.payout_item_id,
    itemStatus: item?.transaction_status,
    feeCents: item?.payout_item_fee ? Math.round(Number(item.payout_item_fee.value) * 100) : undefined,
  };
}

// ── Webhooks ───────────────────────────────────────────────────────────────────────────────

const SIGNATURE_HEADERS = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'] as const;

export async function verifyWebhookSignature(headers: Headers, rawBody: string, webhookId: string) {
  const [authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime] = SIGNATURE_HEADERS.map((h) => headers.get(h));
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return false;
  // Splice the raw body in as-is: re-serializing it would change the bytes PayPal signed.
  const envelope = JSON.stringify({
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: webhookId,
    webhook_event: '__RAW__',
  }).replace('"__RAW__"', () => rawBody);
  const res = await paypal<{ verification_status: string }>('POST', '/v1/notifications/verify-webhook-signature', { rawBody: envelope });
  return res.verification_status === 'SUCCESS';
}

export const WEBHOOK_EVENTS = [
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.PAYOUTSBATCH.SUCCESS',
  'PAYMENT.PAYOUTSBATCH.DENIED',
  'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
  'PAYMENT.PAYOUTS-ITEM.FAILED',
  'PAYMENT.PAYOUTS-ITEM.UNCLAIMED',
  'VAULT.PAYMENT-TOKEN.CREATED',
  'VAULT.PAYMENT-TOKEN.DELETED',
  'CUSTOMER.DISPUTE.CREATED',
] as const;

export async function ensureWebhook(url: string) {
  const { webhooks } = await paypal<{ webhooks: { id: string; url: string }[] }>('GET', '/v1/notifications/webhooks');
  const existing = webhooks.find((w) => w.url === url);
  if (existing) return existing.id;
  const created = await paypal<{ id: string }>('POST', '/v1/notifications/webhooks', {
    body: { url, event_types: WEBHOOK_EVENTS.map((name) => ({ name })) },
  });
  return created.id;
}

// ── Transaction Search (reporting for the console) ─────────────────────────────────────────

export async function searchTransactions(start: Date, end: Date) {
  const params = new URLSearchParams({
    start_date: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    end_date: end.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    fields: 'transaction_info,payer_info,cart_info',
    page_size: '100',
  });
  const res = await paypal<{ transaction_details?: Transaction[] }>('GET', `/v1/reporting/transactions?${params}`);
  return res.transaction_details ?? [];
}
