import { Code } from "./Code";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

/** The defaults from docs/security.md; the file format is from docs/configuration.md. */
const TIERS = [
  { name: "Trusted", tag: "Always there", who: "Visitors whose address is inside your trusted ranges: home, office, a VPN. You define the ranges.", limits: ["5 GB per file", "2 jobs at once", "No daily cap"], extra: "Can change settings and add kits." },
  { name: "Unlocked", tag: "Optional", who: "A visitor from outside who entered an unlock code. It only exists if you set a code, and each unlock lasts an hour unless you change that.", limits: ["5 GB per file", "2 jobs at once", "Downloads shaped to 30 Mbit/s"], extra: "Cannot change settings." },
  { name: "Public", tag: "When outsiders can reach it", who: "Everyone else. On a home network or behind a VPN, no visitor is placed in this tier.", limits: ["2 GB per file", "1 job at a time", "10 GB a day"], extra: "Trusted-only tools show as locked." },
] as const;

export function Access() {
  return (
    <Section id="access" num="08" tone="lime" label="Visitors" title="You choose who can do what."
      intro="Jimkit places each visitor in a tier according to the address they connect from, which makes it straightforward to give your own network full access while applying sensible limits to everyone else. The values below are the defaults. Every limit can be adjusted per tier, and you define which address ranges count as trusted. The unlocked and public tiers apply only when you allow other people in.">
      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t, i) => (
          <Reveal key={t.name} delay={i}>
            <div className="flex h-full flex-col rounded-xl border border-line-strong p-6">
              <div className="flex items-baseline justify-between gap-3"><p className="font-display text-[2rem]">{t.name}</p><span className="font-mono-label text-faint">{t.tag}</span></div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-dim">{t.who}</p>
              <p className="font-mono-label mt-6 text-faint">Default limits</p>
              <ul className="mt-2 space-y-1.5 font-mono text-[13px]">{t.limits.map((f) => <li key={f}>{f}</li>)}</ul>
              <p className="mt-auto pt-5 text-[13.5px] text-dim">{t.extra}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={1}>
        <div className="mt-8 grid gap-6 rounded-xl border border-line-strong p-6 md:grid-cols-[1fr_1.2fr] md:items-center md:gap-10">
          <div>
            <h3 className="font-display text-[1.6rem]">Every limit can be changed.</h3>
            <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-dim">Limits are overrides per tier in <span className="font-mono text-[13px] text-fg">jimkit.config.json</span>: file size, files per batch, concurrent jobs, job timeout, a daily byte allowance and a download speed cap. Sizes are written the way you would say them, 512MB or 5GB or 16k. Anything you leave out keeps its default, and a bad value is ignored.</p>
          </div>
          <Code label="jimkit.config.json" copy={'{\n  "limits": {\n    "public": { "maxFileBytes": "512MB", "dailyBytes": null, "concurrentJobs": 1 },\n    "trusted": { "maxFileBytes": "20GB" }\n  }\n}'}>{`{
  "limits": {
    "public":  { "maxFileBytes": "512MB", "dailyBytes": null, "concurrentJobs": 1 },
    "trusted": { "maxFileBytes": "20GB" }
  }
}`}</Code>
        </div>
      </Reveal>
    </Section>
  );
}
