'use client';

import { Link2, PowerOff, ShieldCheck, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { DashboardState } from '@/lib/dashboard';
import { api } from './use-dashboard';
import { Button, Card, Spinner } from './ui';

export function WalletCard({ wallet, onChanged }: { wallet: DashboardState['wallet']; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const { approveUrl } = await api<{ approveUrl: string }>('/api/wallet/link', { method: 'POST' });
      window.location.href = approveUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm('Unlink PayPal? Every agent immediately loses the ability to spend.')) return;
    setBusy(true);
    try {
      await api('/api/wallet', { method: 'DELETE' });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) {
    return (
      <Card className="flex flex-col justify-between gap-4 border-dashed p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-soft p-2.5 text-brand">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold">Link your PayPal wallet</h3>
            <p className="mt-1 text-sm text-ink-2">
              Approve once on PayPal. Allowance saves the wallet with PayPal Vault, and your agents never see your login or card.
            </p>
          </div>
        </div>
        {error && <p className="text-sm text-deny">{error}</p>}
        <Button onClick={link} disabled={busy} size="lg">
          {busy ? <Spinner /> : <Link2 className="h-4 w-4" aria-hidden="true" />} Link PayPal (sandbox)
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col justify-between gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-allow-soft p-2.5 text-allow">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold">PayPal wallet linked</h3>
          <p className="mt-0.5 truncate text-sm text-ink-2">{wallet.payerEmail}</p>
          <p className="mt-1 text-xs text-ink-3">Saved with PayPal Vault · agents spend only through Allowance</p>
        </div>
      </div>
      <Button variant="secondary" onClick={unlink} disabled={busy} className="text-deny">
        {busy ? <Spinner /> : <PowerOff className="h-4 w-4" aria-hidden="true" />} Kill switch: unlink
      </Button>
    </Card>
  );
}
