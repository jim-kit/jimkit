import { Reveal } from "./Reveal";
import { Section } from "./Section";
import { Terminal } from "./Terminal";

const LINES = [
  { kind: "cmd", text: "node cli/jimkit.mjs kits new word-count" },
  { kind: "out", text: "Created addons/word-count." },
  { kind: "out", text: "  Run `npm run dev` and open it from the home page." },
  { kind: "out", text: "  Edit src/Tool.tsx and src/server.ts." },
  { kind: "cmd", text: "node cli/jimkit.mjs kits pack addons/word-count" },
  { kind: "out", text: "Word count 0.1.0: dist/jimkit-kit.json (31.4 kB, with a server part)" },
  { kind: "out", text: "sha256 3f7a…c91e" },
  { kind: "cmd", text: "gh release create v0.1.0 dist/jimkit-kit.json" },
] as const;

const STEPS = [
  ["Scaffold", "The command line tool in the repository creates a working kit with its own server route, a manifest and a release workflow, so you start from something that already runs."],
  ["Develop", "Run Jimkit with npm run dev. A kit is a folder inside the project, so your changes appear in the browser as you save them."],
  ["Pack", "The pack command builds a single jimkit-kit.json file that contains the manifest, the browser code, the styles and the server code, and checks it with the same validator Jimkit uses on installation."],
  ["Release", "Attach the file to a GitHub release. The registry lists your repository together with its versions and reviews, and it never hosts the code itself, so you stay in control of what you publish."],
];

export function Kits() {
  return (
    <Section id="kits" num="09" tone="ink" label="Kits" title="Add tools and looks without a rebuild."
      intro={<>Open Kits from your own network to browse the registry, or paste a GitHub <span className="font-mono text-[15px] text-fg">user/name</span> to add a kit that the registry does not list. Before anything is installed, Jimkit shows what the kit adds, whether it runs code on the server and which programs it expects. Once you confirm, the new tools appear on the home screen straight away. Looks are kits as well: a theme kit can be a single stylesheet, and it can also bring a home screen of its own.</>}>
      <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <ol className="space-y-6">
          {STEPS.map(([t, d], i) => (
            <Reveal key={t} delay={i}>
              <li className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-strong font-mono text-[13px] text-dim">{i + 1}</span>
                <span><span className="font-display block text-[1.35rem]">{t}</span><span className="mt-1 block text-[15px] leading-relaxed text-dim">{d}</span></span>
              </li>
            </Reveal>
          ))}
        </ol>
        <div className="space-y-5">
          <Reveal delay={1}><Terminal title="~/jimkit" lines={[...LINES]} /></Reveal>
          <Reveal delay={2}>
            <div className="jk-card rounded-xl p-5">
              <h3 className="font-display text-[1.3rem]">What an install checks</h3>
              <ul className="mt-3 space-y-2.5 text-[14.5px] leading-relaxed text-dim">
                <li><span className="text-fg">Only GitHub releases.</span> The file is downloaded from a GitHub release asset, over https.</li>
                <li><span className="text-fg">By hash.</span> If the registry recorded a SHA-256 for that version, the file must match it, or the install is refused.</li>
                <li><span className="text-fg">Your network only.</span> Adding and removing kits is for the trusted tier, and can be switched off.</li>
                <li><span className="text-fg">Server code is not sandboxed.</span> A kit's server route runs with the app's permissions, so install kits you would read.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
