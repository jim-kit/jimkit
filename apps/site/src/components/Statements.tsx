import { Section } from "./Section";
import { Reveal } from "./Reveal";

const ITEMS = [
  ["Many tools in one place", "Write, convert, edit and inspect files, with a set of developer utilities alongside. Every tool opens from a single home screen that works in a browser on a desktop or on a phone, so there is one address to remember and one interface to learn."],
  ["Runs on your own server", "Install Jimkit with Docker, or let the provided script create a Proxmox container for you. Your files stay on your own hardware, and you decide who can reach the application and what each kind of visitor is allowed to do."],
  ["Extended with kits", "A kit adds tools, a new look, or both. Install kits from GitHub while Jimkit is running, with no rebuild or restart, or build your own from a folder that contains a manifest and a React component. The documentation walks through each step."],
];

export function Statements() {
  return (
    <Section id="what" num="01" label="What it is" title="Everyday tools in one application.">
      <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
        {ITEMS.map(([t, d], i) => (
          <Reveal key={t} delay={i} className="bg-bg">
            <div className="h-full p-7 md:p-9">
              <p className="font-display text-[3.4rem] leading-none text-accent">{i + 1}</p>
              <h3 className="font-display mt-6 text-[1.7rem] leading-tight">{t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-dim">{d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
