"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Btn, Chip, Pane, Seg, SendTo, ToolFrame, cx, downloadBlob, toast } from "@jimkit/ui";
import { encodeQr, toPixels, toSvg, wifiPayload, type Ecc, type QrCode } from "./lib/qr";
import { ErrorLine, Field, Input, Select, inputCls } from "./kit";

type Preset = "text" | "url" | "wifi";
const LEVELS: { id: Ecc; hint: string }[] = [
  { id: "L", hint: "Recovers about 7% of damage" }, { id: "M", hint: "About 15%" }, { id: "Q", hint: "About 25%" }, { id: "H", hint: "About 30%" },
];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? Math.round(n) : lo));

export default function QrTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const [preset, setPreset] = useState<Preset>("text");
  const [text, setText] = useState(init?.text ?? "");
  const [url, setUrl] = useState("");
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [security, setSecurity] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [hidden, setHidden] = useState(false);
  const [ecc, setEcc] = useState<Ecc>("M");
  const [quiet, setQuiet] = useState(4);
  const [size, setSize] = useState(512);

  const payload = preset === "text" ? text : preset === "url" ? url.trim() : ssid ? wifiPayload({ ssid, password: pass, security, hidden }) : "";
  const made = useMemo<{ qr?: QrCode; error?: string }>(() => {
    if (!payload) return {};
    try { return { qr: encodeQr(payload, { ecc }) }; } catch { return { error: `Too long for a QR code at level ${ecc}. Shorten the text or lower the error correction.` }; }
  }, [payload, ecc]);
  const { qr } = made;
  const svg = useMemo(() => (qr ? toSvg(qr, quiet) : ""), [qr, quiet]);

  const pngBlob = () => new Promise<Blob | null>((done) => {
    if (!qr) return done(null);
    const scale = Math.max(1, Math.round(size / (qr.size + quiet * 2)));
    const { data, width } = toPixels(qr, scale, quiet);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = width;
    canvas.getContext("2d")!.putImageData(new ImageData(data, width, width), 0, 0);
    canvas.toBlob(done, "image/png");
  });
  const savePng = async () => { const b = await pngBlob(); if (b) downloadBlob("qr-code.png", b, "image/png"); else toast.error("Couldn't make the PNG"); };
  const asFile = async () => { const b = await pngBlob(); if (!b) throw new Error("Couldn't make the PNG"); return [new File([b], "qr-code.png", { type: "image/png" })]; };

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : "Text, links and Wi-Fi codes as SVG or PNG"}>
      <div className={cx("grid min-h-0 flex-1 gap-3 overflow-y-auto p-3", mobile ? "grid-cols-1 content-start" : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)] content-start")}>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="self-start"><Seg label="Content" value={preset} onChange={setPreset} options={[{ id: "text", label: "Text" }, { id: "url", label: "Link" }, { id: "wifi", label: "Wi-Fi" }]} /></div>
          <div className="jk-card flex flex-col gap-3 rounded-2xl p-3.5">
            {preset === "text" && <Field label="Text"><textarea aria-label="Text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Text to encode" spellCheck={false} className={cx(inputCls, "h-[150px] resize-none font-mono")} /></Field>}
            {preset === "url" && <Field label="Link"><Input aria-label="Link" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>}
            {preset === "wifi" && (
              <>
                <Field label="Network name (SSID)"><Input aria-label="Network name" value={ssid} onChange={(e) => setSsid(e.target.value)} /></Field>
                <Field label="Password"><Input aria-label="Password" value={pass} onChange={(e) => setPass(e.target.value)} disabled={security === "nopass"} /></Field>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Security" className="w-[230px] max-w-full">
                    <Select value={security} onChange={(e) => setSecurity(e.target.value as typeof security)}>
                      <option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">None</option>
                    </Select>
                  </Field>
                  <Chip on={hidden} onClick={() => setHidden(!hidden)}>Hidden network</Chip>
                </div>
              </>
            )}
          </div>
          <div className="jk-card flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl p-3.5">
            <div className="flex flex-col gap-1 text-[12px] text-faint"><span>Error correction</span><Seg small label="Error correction" value={ecc} onChange={setEcc} options={LEVELS.map((l) => ({ id: l.id, label: l.id, title: l.hint }))} /></div>
            <Field label="Border (modules)" className="w-[110px]"><Input type="number" min={0} max={10} value={quiet} onChange={(e) => setQuiet(clamp(e.target.valueAsNumber, 0, 10))} /></Field>
            <Field label="PNG size (px)" className="w-[110px]"><Input type="number" min={64} max={4096} step={64} value={size} onChange={(e) => setSize(clamp(e.target.valueAsNumber, 64, 4096))} /></Field>
          </div>
        </div>

        <Pane title="Code" className="self-start"
          right={<><Btn disabled={!qr} onClick={() => downloadBlob("qr-code.svg", svg, "image/svg+xml")}><Download size={14} /> SVG</Btn><Btn disabled={!qr} onClick={() => void savePng()}><Download size={14} /> PNG</Btn><SendTo files={asFile} as={{ name: "qr-code.png", type: "image/png" }} disabled={!qr} title="Open the PNG in another tool" /></>}>
          <div className="flex flex-col items-center gap-3 p-4">
            {/* a QR code is always dark on light, whatever the theme */}
            <div className="aspect-square w-full max-w-[420px] overflow-hidden rounded-xl border border-line bg-white [&>svg]:size-full" role="img" aria-label={qr ? "QR code" : "No code yet"}
              dangerouslySetInnerHTML={qr ? { __html: svg } : undefined}>
            </div>
            {made.error ? <ErrorLine>{made.error}</ErrorLine> : qr ? <p className="text-[12.5px] text-faint">Version {qr.version}, {qr.size}×{qr.size} modules, {qr.mode}, level {qr.ecc}</p> : <p className="text-[12.5px] text-faint">{preset === "wifi" ? "Enter the network name." : "Enter something to encode."}</p>}
          </div>
        </Pane>
      </div>
    </ToolFrame>
  );
}
