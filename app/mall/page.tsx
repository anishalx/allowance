import Link from 'next/link';
import { STORES } from '@/lib/mall/catalog';

export default function MallIndex() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Agent Mall</h1>
      <p className="mt-2 text-black/60">Pretend websites for AI shopping agents to browse.</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {STORES.map((s) => (
          <li key={s.slug}>
            <Link href={`/mall/${s.slug}`} className="block rounded-xl border border-black/10 bg-white p-5 hover:shadow-md">
              <div className="text-lg font-semibold" style={{ color: s.accent }}>
                {s.merchantName}
              </div>
              <div className="mt-1 text-sm text-black/60">{s.tagline}</div>
              <div className="mt-3 font-mono text-xs text-black/40">{s.domain}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
