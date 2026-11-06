import { ArrowRight, BadgeCheck, Bot, Briefcase, Check, Gavel, Hand, Landmark, ScrollText, Send, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { Chip, Logo, Meter } from '@/components/ui';

const PIPELINE = [
  { icon: Bot, title: 'Agent asks', body: 'Any MCP agent calls request_payment with its cart and reason.', tone: 'bg-surface-2 text-ink-2' },
  { icon: Gavel, title: 'Rules engine', body: 'Your plain-English rules, compiled to hard limits. Deterministic and unit-tested.', tone: 'bg-surface-2 text-ink' },
  { icon: Sparkles, title: 'AI auditor', body: 'Checks intent: injection, payee swaps, items that don’t fit the job. Can only say “stricter”.', tone: 'bg-ai-soft text-ai' },
  { icon: UserCheck, title: 'You, if needed', body: 'Bigger or unusual purchases ping your phone. One tap to approve.', tone: 'bg-ask-soft text-ask' },
  { icon: Landmark, title: 'PayPal moves money', body: 'Vaulted wallet charged via Orders v2; merchant paid via Payouts.', tone: 'bg-allow-soft text-allow' },
];

const STATS = [
  {
    value: '3%',
    label: 'of people would let an AI agent pay without their final approval',
    source: 'Ping Identity 2026 consumer survey, 11,000 people',
    href: 'https://www.pingidentity.com/en/lp/4423-2026-consumer-survey-ai-trust.html',
  },
  {
    value: '10 in 10',
    label: 'times a DeepSeek V4 Pro shopping agent paid an account named in a hidden "payments moved" note',
    source: "Allowance's attack lab",
    href: 'https://github.com/anishalx/allowance#attack-lab',
  },
  {
    value: '$1T',
    label: 'US agentic commerce revenue projected by 2030',
    source: 'ICSC and McKinsey',
    href: 'https://www.retaildive.com/news/agentic-commerce-us-one-trillion-2030/818936/',
  },
];

const FEATURES = [
  {
    icon: ScrollText,
    title: 'Rules in your words',
    body: '“Groceries only, $60 a week, ask me over $25, never alcohol.” Allowance shows exactly how it understood you, and adds safety rules you’d want anyway.',
  },
  {
    icon: ShieldAlert,
    title: 'Safe even when the agent isn’t',
    body: 'Agents read the web, and the web lies. A hijacked agent still can’t pick where money goes: payees come from a verified directory, and cash-equivalents are blocked.',
  },
  {
    icon: Briefcase,
    title: 'Guards your business account too',
    body: 'Support agents can refund and invoice through PayPal’s own Agent Toolkit, with caps, a check that the requester actually paid, and you in the loop for anything big.',
  },
  {
    icon: Hand,
    title: 'You stay in control',
    body: 'Live activity, a full decision trace for every request, one-tap refunds, per-agent freeze, and a kill switch that deletes the PayPal vault token.',
  },
];

// What the product does, at a glance: one purchase paid, one scam blocked, the allowance it all counts against.
function HeroPreview() {
  return (
    <div className="relative isolate" role="img" aria-label="Example: Allowance pays a grocery order and blocks a payment to a lookalike account">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-soft via-white to-ai-soft md:-inset-8" aria-hidden="true" />
      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-ink-3">Pantry wants to pay</div>
              <div className="mt-0.5 flex items-center gap-1.5 font-medium">
                FreshCart Groceries <BadgeCheck className="h-4 w-4 shrink-0 text-allow" aria-hidden="true" />
              </div>
            </div>
            <div className="tabular text-xl font-semibold">$22.49</div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-2">Oat milk, eggs, bananas, coffee</span>
            <Chip tone="allow">
              <Check className="h-3 w-3" aria-hidden="true" /> Paid with PayPal
            </Chip>
          </div>
        </div>

        <div className="rounded-2xl border border-deny/25 bg-white p-4 shadow-card ring-4 ring-deny-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-ink-3">Pantry wants to pay</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-medium">
                HarvestLane Pay <Chip tone="deny">Unverified payee</Chip>
              </div>
            </div>
            <div className="tabular text-xl font-semibold">$24.15</div>
          </div>
          <div className="mt-3 rounded-xl bg-ai-soft p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-ai">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Blocked by AI auditor · risk 95
            </div>
            <p className="mt-1 leading-relaxed text-ink-2">Looks like Harvest Lane Market but would pay a different PayPal account: a payment-redirection scam.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
          <Meter label="Pantry · this week" spent={2249} limit={6000} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone="allow">Auto-approves up to $25</Chip>
            <Chip>No alcohol</Chip>
            <Chip>No gift cards</Chip>
          </div>
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-brand">{children}</p>;
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
            <Logo /> Allowance
          </Link>
          <nav className="flex items-center gap-1 text-sm" aria-label="Main">
            <Link href="/playground" className="hidden rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
              Playground
            </Link>
            <a href="https://github.com/anishalx/allowance" className="rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink">
              GitHub
            </a>
            <Link href="/dashboard" className="ml-1 rounded-xl bg-ink px-4 py-2 font-medium text-white shadow-card hover:bg-ink/85">
              Open dashboard
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-14 pb-20 md:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" /> Built on PayPal Vault, Orders, Payouts, Webhooks &amp; the Agent Toolkit
          </p>
          <h1 className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight md:text-[3.5rem]">
            Give your AI agents an allowance, <span className="text-brand">not your password.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
            Agents can shop for you now. Allowance lets any agent pay with your PayPal, within rules you write in plain English, checked by an AI auditor, with you one tap away.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/playground" className="inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 font-medium text-white shadow-card hover:bg-ink/85">
              Watch an attack get stopped <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/dashboard" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-white px-6 font-medium shadow-card hover:bg-surface-2">
              Open the dashboard
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-3">Live demo · your own private sandbox · no sign-up</p>
        </div>
        <HeroPreview />
      </section>

      <section className="border-y border-line bg-surface-2/70">
        <ul className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          {STATS.map((st) => (
            <li key={st.value}>
              <div className="tabular text-4xl font-semibold tracking-tight text-brand">{st.value}</div>
              <p className="mt-2 text-[15px] leading-snug text-ink">{st.label}</p>
              <a href={st.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-ink-3 underline-offset-2 hover:underline">
                {st.source}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Every purchase, every time</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Five checkpoints between an agent and your money. The AI can only make a decision stricter, and PayPal moves money only when every check agrees.
          </p>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-5">
          {PIPELINE.map(({ icon: Icon, title, body, tone }, i) => (
            <li key={title} className="relative rounded-2xl border border-line bg-white p-5 shadow-card">
              <div className="flex items-center justify-between">
                <div className={`inline-flex rounded-xl p-2.5 ${tone}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="text-xs font-semibold text-ink-3">0{i + 1}</span>
              </div>
              <div className="mt-4 text-[15px] font-semibold">{title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
              {i < PIPELINE.length - 1 && (
                <ArrowRight className="absolute top-1/2 -right-3.5 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-white text-ink-3 md:block" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-surface-2/70">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-2xl">
            <Eyebrow>Why it&apos;s safe</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Built for the day the agent gets it wrong</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-line bg-white p-6 shadow-card">
                <div className="inline-flex rounded-xl bg-brand-soft p-2.5 text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>For developers</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Works with the agent you already use</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Allowance is a remote MCP server. Add it to Claude Code, Cursor, Claude Desktop or the OpenAI Responses API with one line, and each agent gets its own key and its own limits.
            </p>
            <Link href="/connect" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-5 text-sm font-medium shadow-card hover:bg-surface-2">
              Connect an agent <Send className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <pre className="overflow-x-auto rounded-2xl bg-ink p-5 font-mono text-[13px] leading-relaxed text-white/90 shadow-card">
            <code>{'claude mcp add --transport http allowance \\\n  https://…/api/mcp \\\n  --header "Authorization: Bearer alw_…"'}</code>
          </pre>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-ink-3">
          <div className="flex items-center gap-2">
            <Logo className="h-5 w-5" /> Allowance · built for the PayPal AI Hackathon
          </div>
          <div>PayPal sandbox only, no real money moves · MIT licensed</div>
        </div>
      </footer>
    </div>
  );
}
