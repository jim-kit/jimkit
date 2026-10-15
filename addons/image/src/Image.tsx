"use client";

import type { ToolProps } from "@jimkit/sdk";
import { useHost } from "@jimkit/sdk/react";
import { Btn, ToolFrame, toast, useFilePicker } from "@jimkit/ui";
import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { DesktopEditor } from "./DesktopEditor";
import { MobileEditor } from "./MobileEditor";

/** Formats a browser can decode itself. HEIC and friends have to go through the converter first. */
const EDITABLE = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp"]);
const extOf = (n: string) => n.split(".").pop()?.toLowerCase() ?? "";

export default function ImageTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const host = useHost();
  const [file, setFile] = useState<File | null>(init?.files?.[0] ?? null);
  const picker = useFilePicker("image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,.heic,.heif", (f) => {
    if (!EDITABLE.has(extOf(f.name)) && !f.type.startsWith("image/")) return void toast.error("That isn't an image.");
    setFile(f);
  });

  if (file && !EDITABLE.has(extOf(file.name)) && !file.type.match(/^image\/(jpeg|png|webp|gif|avif|bmp)$/)) {
    const canConvert = host.hasTool("convert");
    return (
      <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile}>
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-md">
            <p className="text-[17px] font-semibold">Browsers can't open {extOf(file.name).toUpperCase() || "this kind of"} images.</p>
            <p className="mt-2 text-[14px] text-dim">{canConvert ? "Convert it to PNG or JPG first, then edit that." : "Convert it to PNG or JPG somewhere else first."}</p>
            <div className="mt-5 flex justify-center gap-2">
              {canConvert && <Btn primary onClick={() => host.open("convert", { files: [file] })}>Convert it</Btn>}
              <Btn onClick={() => setFile(null)}>Choose another</Btn>
            </div>
          </div>
        </div>
      </ToolFrame>
    );
  }

  if (!file) {
    return (
      <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile}>
        {picker.input}
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <ImagePlus size={44} className="mx-auto text-faint" strokeWidth={1.4} />
            <p className="mt-4 text-[17px] font-semibold">Choose a photo to edit</p>
            <p className="mt-1 text-[14px] text-dim">JPG, PNG, WebP, GIF, AVIF or BMP.</p>
            <div className="mt-5 flex justify-center"><Btn primary onClick={picker.open}>Choose a photo</Btn></div>
          </div>
        </div>
      </ToolFrame>
    );
  }

  const Editor = mobile ? MobileEditor : DesktopEditor;
  // the edited picture can go to any tool that takes an image: the converter, the hash tool, this editor again…
  const onApply = (f: File) => host.offer([f]);
  return <Editor key={file.name + file.size} file={file} onApply={onApply} onClose={onClose} />;
}
