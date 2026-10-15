"use client";

import { Seg } from "@jimkit/ui";
import Link from "next/link";
import { useState } from "react";
import { Code } from "./Code";
import { Reveal } from "./Reveal";
import { Section } from "./Section";
import { REPO_URL } from "@/lib/site";
import { Swap } from "./Swap";

type Way = "docker" | "proxmox";
const WAYS = ["docker", "proxmox"] as const;

const NEEDS = [
  ["Linux or a Proxmox host", "2 GB of RAM free for lite, 4 GB for full"],
  ["Docker with Compose", "the installer offers to install it"],
  ["Disk", "400 MB or 1.8 GB for the image, plus scratch space for uploads (capped at 30 GB by default)"],
  ["ARM", "works if the image is built on the machine itself"],
];

export function Install() {
  const [way, setWay] = useState<Way>("docker");
  return (
    <Section id="install" num="10" label="Install" title="Run it on your own infrastructure."
      intro={<>Jimkit can be installed with Docker or in a dedicated Proxmox container. The installer script builds the image, writes a <span className="font-mono text-[15px] text-fg">.env</span> file with a freshly generated session secret, starts the container and waits until the application responds, and then prints the address to open.</>}>
      <div className="w-fit"><Seg label="How to run it" value={way} onChange={setWay} options={[{ id: "docker", label: "Docker" }, { id: "proxmox", label: "Proxmox" }]} /></div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="min-w-0 space-y-4">
          <Swap value={way} order={WAYS}>
            {way === "docker" && (
              <div>
                <Code>{`$ git clone ${REPO_URL}.git && cd jimkit
$ ./install/install.sh

# later: builds beside the running copy, swaps, rolls back if unhealthy
$ jimkit update`}</Code>
                <p className="mt-4 text-[14.5px] leading-relaxed text-dim">The script asks which variant, the port, whether a reverse proxy is in front and an optional unlock code. <span className="font-mono text-[13px] text-fg">--yes</span> skips the questions and <span className="font-mono text-[13px] text-fg">--minimal</span> installs the lite image with only the Basic look. <span className="font-mono text-[13px] text-fg">jimkit update --check</span> only looks, the app also shows a dot when a newer version exists, and <span className="font-mono text-[13px] text-fg">jimkit delete</span> shows what it would remove before it removes it. The container runs as a normal user with a read-only filesystem, no capabilities and one writable volume.</p>
              </div>
            )}
            {way === "proxmox" && (
              <div>
                <Code>{`# on the Proxmox host, as root
$ git clone ${REPO_URL}.git && cd jimkit
$ bash install/proxmox-lxc.sh --source ${REPO_URL}.git

# or choose the details yourself
$ bash install/proxmox-lxc.sh \\
    --source ${REPO_URL}.git \\
    --variant lite --memory 3072 \\
    --ip 192.168.1.50/24 --gateway 192.168.1.1`}</Code>
                <p className="mt-4 text-[14.5px] leading-relaxed text-dim">It picks the next free container id, downloads the Debian 12 template if needed and creates an unprivileged container with nesting and keyctl, installs Docker inside and runs the installer. It never touches an existing container, and <span className="font-mono text-[13px] text-fg">--dry-run</span> shows what it would do.</p>
              </div>
            )}
          </Swap>
          <p className="text-[13.5px] text-faint">Exposing it to the internet needs the proxy setting to be right. <Link href="/docs/security/" className="text-accent hover:underline">Read the security page first</Link>.</p>
        </div>

        <Reveal delay={1}>
          <div className="space-y-4">
            <div className="jk-card overflow-hidden rounded-xl">
              <table className="w-full text-left text-[14px]">
                <thead><tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-faint"><th className="px-4 py-2.5 font-semibold">Variant</th><th className="px-4 py-2.5 font-semibold">Adds</th><th className="px-4 py-2.5 font-semibold">Image</th></tr></thead>
                <tbody>
                  <tr className="border-b border-line"><td className="px-4 py-3 font-mono text-[13px]">lite</td><td className="px-4 py-3 text-dim">Nothing. Text, hash and image tools, and CSV, JSON and YAML conversion.</td><td className="px-4 py-3 text-dim">~400 MB</td></tr>
                  <tr><td className="px-4 py-3 font-mono text-[13px]">full</td><td className="px-4 py-3 text-dim">ffmpeg, ImageMagick, LibreOffice, pandoc, poppler and librsvg: the converter handles nearly everything.</td><td className="px-4 py-3 text-dim">~1.8 GB</td></tr>
                </tbody>
              </table>
            </div>
            <div className="jk-card rounded-xl p-5">
              <h3 className="text-[15px] font-semibold">What you need</h3>
              <dl className="mt-3 space-y-2.5 text-[14px]">
                {NEEDS.map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3"><dt className="text-fg">{k}</dt><dd className="text-dim">{v}</dd></div>)}
              </dl>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
