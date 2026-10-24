import Link from 'next/link';
import { notFound } from 'next/navigation';
import { STORES, storeBySlug } from '@/lib/mall/catalog';

export function generateStaticParams() {
  return STORES.map((s) => ({ store: s.slug }));
}

export default async function StorePage({ params }: { params: Promise<{ store: string }> }) {
  const store = storeBySlug((await params).store);
  if (!store) notFound();
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: store.accent }}>
            {store.merchantName}
          </h1>
          <p className="mt-1 text-black/60">{store.tagline}</p>
          <p className="mt-1 font-mono text-xs text-black/40">{store.domain} · pays out via PayPal</p>
        </div>
        {store.slug === 'freshcart' && (
          <Link href={`/mall/${store.slug}/deals`} className="rounded-full px-4 py-2 text-sm font-medium text-white" style={{ background: store.accent }}>
            This week&apos;s deals →
          </Link>
        )}
      </header>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {store.products.map((p) => (
          <li key={p.sku} className="rounded-xl border border-black/10 bg-white p-4">
            <div className="font-medium">{p.name}</div>
            <div className="mt-1 text-sm text-black/60">{p.blurb}</div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-lg font-semibold">${p.price.toFixed(2)}</span>
              <span className="font-mono text-xs text-black/40">sku: {p.sku}</span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
