import { ArrowRight, Bot, Briefcase, Gavel, Hand, Landmark, ScrollText, Send, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/ui';

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
    value: '8 in 10',
    label: 'times a GPT-5.5 shopping agent paid a forged "payments moved" payee',
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

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo /> Allowance
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <a href="https://github.com/anishalx/allowance" className="rounded-lg px-3 py-1.5 text-ink-2 hover:text-ink">
            GitHub
          </a>
          <Link href="/dashboard" className="rounded-lg bg-ink px-3 py-1.5 font-medium text-canvas hover:opacity-90">
            Open dashboard
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-12 md:pt-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-allow" /> Built on PayPal Vault, Orders, Payouts, Webhooks &amp; the Agent Toolkit
        </p>
        <h1 className="mt-6 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight md:text-6xl">
          Give your AI agents an allowance, <span className="text-brand">not your password.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-2">
          Agents can shop for you now. Allowance lets any agent pay with your PayPal, within rules you write in plain English, checked by an AI auditor, with you one tap away.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/playground" className="inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 font-medium text-canvas hover:opacity-90">
            Watch an attack get stopped <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/dashboard" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-6 font-medium hover:bg-surface-2">
            Open the dashboard
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4">
        <ul className="grid gap-3 md:grid-cols-3">
          {STATS.map((st) => (
            <li key={st.value} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="tabular text-3xl font-semibold tracking-tight text-brand">{st.value}</div>
              <p className="mt-1 text-sm">{st.label}</p>
              <a href={st.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-ink-3 underline-offset-2 hover:underline">
                {st.source}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-sm font-semibold tracking-wide text-ink-2 uppercase">Every purchase, every time</h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-5">
          {PIPELINE.map(({ icon: Icon, title, body, tone }, i) => (
            <li key={title} className="relative rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className={`inline-flex rounded-lg p-2 ${tone}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="mt-3 text-sm font-semibold">
                <span className="text-ink-3">{i + 1}.</span> {title}
              </div>
              <p className="mt-1 text-sm text-ink-2">{body}</p>
              {i < PIPELINE.length - 1 && <ArrowRight className="absolute top-1/2 -right-3 z-10 hidden h-5 w-5 -translate-y-1/2 text-ink-3 md:block" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <Icon className="h-6 w-6 text-brand" aria-hidden="true" />
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-ink-2">{body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-3xl bg-ink p-8 text-canvas md:p-12">
          <h2 className="text-2xl font-semibold md:text-3xl">Works with the agent you already use</h2>
          <p className="mt-3 max-w-2xl opacity-80">
            Allowance is a remote MCP server. Add it to Claude Code, Cursor, Claude Desktop or the OpenAI Responses API with one line, and each agent gets its own key and its own limits.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-xl bg-white/10 p-4 font-mono text-sm">
            claude mcp add --transport http allowance https://…/api/mcp --header &quot;Authorization: Bearer alw_…&quot;
          </pre>
          <Link href="/connect" className="mt-6 inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline">
            Connect an agent <Send className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-3">
        Built for the PayPal AI Hackathon · PayPal sandbox only, no real money moves · MIT licensed
      </footer>
    </div>
  );
}
