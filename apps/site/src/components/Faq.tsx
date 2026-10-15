import { Plus } from "lucide-react";
import { Section } from "./Section";

/** Answers taken from the docs (install, security, kits, configuration); nothing here is invented. */
export const QA: [string, string][] = [
  ["Where do uploaded files go?", "Uploads are stored on the data volume while a job runs and are deleted as soon as it finishes. Results are deleted after 6 hours by default, and total storage is capped at 30 GB, with the oldest files removed first. Files are not encrypted at rest, so anyone with access to the host can read them while they are stored."],
  ["Can other people use my installation?", "Yes, if you allow it. Visitors outside your trusted ranges receive the public tier with its own limits, and you can also protect the installation with an unlock code. We recommend placing a reverse proxy that applies rate limiting in front of any full installation that can be reached from the internet."],
  ["What is the difference between lite and full?", "Lite (about 400 MB) includes the text, hash and image tools and converts CSV, JSON and YAML. Full (about 1.8 GB) adds ffmpeg, ImageMagick, LibreOffice, pandoc, poppler and librsvg, so the converter supports almost every common format."],
  ["Does it work on a phone?", "Yes. On a phone the tools use a bottom bar and touch-sized controls, and every drag interaction has a button alternative."],
  ["Can I add my own tools?", "Yes. A kit is a folder with a manifest, a React component and, if needed, a server route. The command line tool creates the starting files and packs the kit into a single file for a GitHub release, and Jimkit installs it from there without a rebuild."],
  ["Is kit code sandboxed?", "No. A kit's server code runs with the same permissions as the app. Installation is limited to your own network, to GitHub release files and to the hash recorded in the registry, and we recommend adding only kits whose code you have reviewed."],
  ["How do I update it?", "Run jimkit update. It shows what changed, builds the new version while the current one continues to serve, switches over, and returns to the previous version automatically if the new one does not start correctly. Your settings and data are left untouched. The app also shows a dot on Settings when a newer version is available, and it never updates itself."],
  ["How do I remove it?", "Run jimkit delete. It lists what will be removed and asks for confirmation. By default it removes the container, the image and the jimkit command, and keeps your data and the folder. The --data, --files and --all options remove more, --dry-run only shows the plan, and a copy of .env and your settings is saved before anything of yours is deleted."],
  ["Can I install it with fewer looks?", "Yes. install.sh --minimal installs the lite image with only the Basic look switched on. Paper, Glass and Metro are included as kits that you can switch on later from the Kits screen, or leave out of the image entirely."],
  ["What is it built with, and under which licence?", "Jimkit is built with Next.js, React and Tailwind on Node 22. The core application, the first-party tools, the command line tool and the installers are licensed AGPL-3.0-or-later. The SDK and the UI kit are MIT licensed, so a kit can use any licence."],
];

export function Faq() {
  return (
    <Section id="faq" num="11" label="Questions" title="Frequently asked questions.">
      <div className="divide-y divide-line border-y border-line">
        {QA.map(([q, a]) => (
          <details key={q} className="faq group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
              <span className="font-display text-[clamp(1.25rem,2.2vw,1.7rem)] leading-snug">{q}</span>
              <Plus size={22} className="shrink-0 text-accent transition-transform duration-300 group-open:rotate-45" />
            </summary>
            <p className="max-w-3xl pb-7 text-[16px] leading-relaxed text-dim">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
