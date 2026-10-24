import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Agent Mall (demo stores)' };

// Stand-in third-party websites that the demo agents shop on. Deliberately not Allowance-branded.
export default function MallLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[#fbfaf7] text-[#1d1d1b]">
      <div className="border-b border-black/10 bg-white/70 px-4 py-2 text-center text-xs text-black/60">
        Demo storefronts for the Allowance hackathon project. Prices are fake; payments run in the PayPal sandbox.{' '}
        <Link href="/mall" className="underline">
          All stores
        </Link>
      </div>
      {children}
    </div>
  );
}
