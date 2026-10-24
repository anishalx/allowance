'use client';

import { ShieldCheck } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui';

export type ConfirmRequest = { title: string; body: string; confirmLabel: string; danger?: boolean };

// Human-in-the-loop gate for the console assistant's actions. It lives in app code, outside the model's
// reach: a tool can ask, but only a click here lets it proceed.
export function useConfirm() {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (req: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setPending(req);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  const dialog = pending ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={pending.title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="slide-in relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-ai uppercase">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Guardian wants to act
        </div>
        <h2 className="mt-2 text-lg font-semibold">{pending.title}</h2>
        <p className="mt-2 text-sm whitespace-pre-line text-ink-2">{pending.body}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button variant={pending.danger ? 'danger' : 'allow'} onClick={() => settle(true)}>
            {pending.confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    // Portal to <body>: the console sits in a transformed container, which would trap `fixed` positioning.
    document.body,
  ) : null;

  return { confirm, dialog };
}
