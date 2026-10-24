// Client-safe formatting helpers.

export const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CATEGORY_LABELS: Record<string, string> = {
  alcohol_tobacco: 'Alcohol & tobacco',
  gift_cards: 'Gift cards',
  money_transfer: 'Money transfers',
  books_education: 'Books & courses',
  home_services: 'Home services',
  personal_care: 'Personal care',
  office_supplies: 'Office supplies',
  require_approval: 'Needs approval',
};

export const titleCase = (s: string) => CATEGORY_LABELS[s] ?? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const dollarsToCents = (value: string | null | undefined) => (value ? Math.round(Number(value.replace(/[$,]/g, '')) * 100) : 0);
