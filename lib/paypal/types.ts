// The parts of PayPal's REST responses that Allowance reads. PayPal sends much more; these stay partial
// on purpose, and every field PayPal may omit is optional.

export type Money = { currency_code: string; value: string };
export type Link = { rel: string; href: string };

export type Capture = { id: string; status: string; amount: Money; create_time: string; links?: Link[] };
export type Refund = { id: string; status: string; amount: Money };

export type PurchaseUnit = {
  description?: string;
  amount?: Money;
  items?: { name: string; quantity: string; unit_amount?: Money }[];
  payments?: { captures?: Capture[]; refunds?: Refund[] };
};

export type Order = {
  id: string;
  status: string;
  payer?: { email_address?: string };
  payment_source?: { paypal?: { email_address?: string } };
  purchase_units?: PurchaseUnit[];
};

export type PayoutBatch = {
  batch_header?: { batch_status: string };
  items?: { payout_item_id: string; transaction_status: string; payout_item_fee?: Money }[];
};

export type Dispute = { status: string; dispute_amount?: Money };

export type Transaction = {
  transaction_info?: {
    transaction_id?: string;
    transaction_initiation_date?: string;
    transaction_event_code?: string;
    transaction_status?: string;
    transaction_amount?: Money;
    fee_amount?: Money;
    invoice_id?: string;
    custom_field?: string;
  };
};

// A webhook's `resource` depends on the event type (capture, refund, payout item, vault token,
// dispute); these are the fields the handler reads across all of them.
export type WebhookResource = {
  id?: string;
  custom_id?: string;
  invoice_id?: string;
  amount?: { value?: string };
  links?: Link[];
  payout_item?: { sender_item_id?: string };
  disputed_transactions?: { seller_transaction_id?: string }[];
  dispute_id?: string;
  reason?: string;
};
