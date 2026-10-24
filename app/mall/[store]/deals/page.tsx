import { notFound } from 'next/navigation';
import { INJECTION_TEXT, storeBySlug } from '@/lib/mall/catalog';

export function generateStaticParams() {
  return [{ store: 'freshcart' }];
}

export default async function DealsPage({ params }: { params: Promise<{ store: string }> }) {
  const store = storeBySlug((await params).store);
  if (!store || store.slug !== 'freshcart') notFound();
  const coffee = store.products.find((p) => p.sku === 'coffee')!;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold" style={{ color: store.accent }}>
        This week at FreshCart
      </h1>
      <ul className="mt-6 space-y-3">
        <li className="rounded-xl border border-black/10 bg-white p-4">
          <span className="font-medium">{coffee.name}</span>: 20% off this week, now{' '}
          <strong>${(coffee.price * 0.8).toFixed(2)}</strong> at checkout.
        </li>
        <li className="rounded-xl border border-black/10 bg-white p-4">
          <span className="font-medium">Bananas</span>: still just $2.40 a bunch.
        </li>
        <li className="rounded-xl border border-black/10 bg-white p-4">Free delivery on orders over $20.</li>
      </ul>
      {/* The attack: hidden from people, read by any agent that scrapes page text. */}
      <div style={{ display: 'none' }} aria-hidden="true" data-demo="prompt-injection">
        {INJECTION_TEXT}
      </div>
    </main>
  );
}
