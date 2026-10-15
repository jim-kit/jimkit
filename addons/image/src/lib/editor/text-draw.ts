import { fontCss, layoutText, type Layout, type Measure } from "./text";
import type { TextItem } from "./types";

/** Measures with the context's own font engine, so a box fits the glyphs the preview and the export will really draw. */
export function measureWith(ctx: CanvasRenderingContext2D): Measure {
  return (line, font) => {
    ctx.save();
    ctx.font = font;
    const w = ctx.measureText(line).width;
    ctx.restore();
    return w;
  };
}

export const textLayout = (ctx: CanvasRenderingContext2D, t: TextItem): Layout => layoutText(t, measureWith(ctx));

/**
 * One function draws text for the preview and for the export, at any scale, so they cannot disagree. The context is
 * turned about the text's centre and scaled, then the text is laid out in its own units.
 */
export function drawText(ctx: CanvasRenderingContext2D, t: TextItem, scale: number): void {
  if (!t.text) return;
  const l = textLayout(ctx, t);
  ctx.save();
  ctx.translate(t.x * scale, t.y * scale);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= t.opacity;
  ctx.font = fontCss(t, t.size);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.textAlign = t.align;
  const ax = t.align === "left" ? -l.w / 2 + l.pad : t.align === "right" ? l.w / 2 - l.pad : 0;
  const lineY = (i: number) => -l.h / 2 + l.pad + (i + 0.5) * l.lineH;

  // the shadow goes under whatever is drawn first, so it is never doubled up
  let shadowed = !t.shadow;
  const shadow = () => {
    if (shadowed) return;
    shadowed = true;
    // shadows are in device pixels, not affected by the transform
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = t.size * scale * 0.14;
    ctx.shadowOffsetY = t.size * scale * 0.04;
  };
  const noShadow = () => {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };

  if (t.bg) {
    shadow();
    ctx.fillStyle = t.bg;
    ctx.beginPath();
    const r = Math.min(l.pad, l.h / 2);
    if (typeof ctx.roundRect === "function") ctx.roundRect(-l.w / 2, -l.h / 2, l.w, l.h, r * 0.6);
    else ctx.rect(-l.w / 2, -l.h / 2, l.w, l.h);
    ctx.fill();
    noShadow();
  }
  if (t.outline > 0) {
    shadow();
    ctx.strokeStyle = t.outlineColor;
    ctx.lineWidth = t.outline * t.size * 2; // half of it sits under the fill, so this is twice the visible width
    l.lines.forEach((line, i) => ctx.strokeText(line, ax, lineY(i)));
    noShadow();
  }
  ctx.fillStyle = t.color;
  shadow();
  l.lines.forEach((line, i) => ctx.fillText(line, ax, lineY(i)));
  ctx.restore();
}
