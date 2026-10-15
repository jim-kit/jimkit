import { MAX_OUTPUT_BYTES, settings } from "../config";
import { run } from "@jimkit/sdk/server";
import type { Quality } from "../types";
import type { Engine } from "./types";

const VIDEO_CRF = { low: 30, balanced: 24, high: 19 };
const VP9_CRF = { low: 40, balanced: 33, high: 27 };
const AAC_K = { low: 96, balanced: 160, high: 256 };
const OPUS_K = { low: 64, balanced: 128, high: 192 };
const MP3_Q = { low: 6, balanced: 3, high: 0 }; // libmp3lame VBR, lower is better
const VORBIS_Q = { low: 3, balanced: 5, high: 8 };

/** Fit the longest side to `n` (never enlarging), keeping the proportions; the other side is rounded to an even number. */
const fit = (n: number) => `scale=w='if(gt(iw,ih),min(${n},iw),-2)':h='if(gt(iw,ih),-2,min(${n},ih))'`;
/** x264 with yuv420p needs both sides even: a 853 x 480 picture would fail with "width not divisible by 2" */
const EVEN = "scale=trunc(iw/2)*2:trunc(ih/2)*2";

export function videoArgs(to: string, q: Quality): string[] {
  const l = q.level;
  // both sides even for the codecs that insist on it (x264, mpeg4 and VP9 are fine with odd sizes; x264 and yuv420p are not)
  const chain = (even: boolean) => { const f = [...(q.maxDim > 0 ? [fit(q.maxDim)] : []), ...(even ? [EVEN] : [])]; return f.length ? ["-vf", f.join(",")] : []; };
  const scale = chain(true);
  const x264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(VIDEO_CRF[l]), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", `${AAC_K[l]}k`];
  switch (to) {
    case "mp4":
    case "mov":
      return [...scale, ...x264, "-movflags", "+faststart"];
    case "mkv":
      return [...scale, ...x264];
    case "webm":
      return [...chain(false), "-c:v", "libvpx-vp9", "-crf", String(VP9_CRF[l]), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-c:a", "libopus", "-b:a", `${OPUS_K[l]}k`];
    case "avi":
      return [...chain(false), "-c:v", "mpeg4", "-q:v", l === "high" ? "2" : l === "balanced" ? "4" : "7", "-c:a", "libmp3lame", "-q:a", String(MP3_Q[l])];
    default:
      throw new Error("unsupported video target");
  }
}

function audioArgs(to: string, q: Quality): string[] {
  const l = q.level;
  switch (to) {
    case "mp3": return ["-vn", "-c:a", "libmp3lame", "-q:a", String(MP3_Q[l])];
    case "wav": return ["-vn", "-c:a", "pcm_s16le"];
    case "flac": return ["-vn", "-c:a", "flac"];
    case "ogg": return ["-vn", "-c:a", "libvorbis", "-q:a", String(VORBIS_Q[l])];
    case "opus": return ["-vn", "-c:a", "libopus", "-b:a", `${OPUS_K[l]}k`];
    case "m4a": return ["-vn", "-c:a", "aac", "-b:a", `${AAC_K[l]}k`];
    case "aac": return ["-vn", "-c:a", "aac", "-b:a", `${AAC_K[l]}k`, "-f", "adts"];
    default: throw new Error("unsupported audio target");
  }
}

const VIDEO_TARGETS = new Set(["mp4", "mkv", "webm", "mov", "avi"]);

// The input format is forced from the file's extension instead of being sniffed. Sniffing would let a crafted file
// present itself as a playlist or concat script and make ffmpeg read other files on the server.
const DEMUXER: Record<string, string> = {
  mp4: "mov", mov: "mov", m4a: "mov", mkv: "matroska", webm: "matroska", avi: "avi", flv: "flv", wmv: "asf", wma: "asf",
  mp3: "mp3", wav: "wav", flac: "flac", ogg: "ogg", opus: "ogg", aac: "aac",
};

export function gifArgs(q: Quality): string[] {
  const width = q.maxDim > 0 ? q.maxDim : 480;
  return ["-an", "-vf", `fps=12,${fit(width)}:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`, "-loop", "0"];
}

async function duration(input: string, demuxer: string, cwd: string, timeoutMs: number, signal: AbortSignal): Promise<number> {
  let out = "";
  try {
    await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-f", demuxer, "-show_entries", "format=duration", "-of", "csv=p=0", input], {
      cwd, timeoutMs: Math.min(timeoutMs, 60_000), signal, onStdout: (c) => (out += c),
    });
  } catch {
    return 0;
  }
  const d = parseFloat(out.trim());
  return Number.isFinite(d) ? d : 0;
}

export const ffmpeg: Engine = async (ctx) => {
  const demuxer = DEMUXER[ctx.inputExt];
  if (!demuxer) throw new Error("unsupported media type");
  const total = await duration(ctx.input, demuxer, ctx.outDir, ctx.timeoutMs, ctx.signal);
  const codec = VIDEO_TARGETS.has(ctx.to) ? videoArgs(ctx.to, ctx.quality) : ctx.to === "gif" ? gifArgs(ctx.quality) : audioArgs(ctx.to, ctx.quality);
  const maps = VIDEO_TARGETS.has(ctx.to) ? ["-map", "0:v:0", "-map", "0:a:0?"] : ctx.to === "gif" ? ["-map", "0:v:0"] : ["-map", "0:a:0"];
  const args = [
    "-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file,pipe",
    "-f", demuxer, "-i", ctx.input, ...maps, "-sn", "-dn", "-threads", String(settings.threads), "-max_muxing_queue_size", "1024",
    ...codec, "-fs", String(MAX_OUTPUT_BYTES), "-progress", "pipe:1", "-nostats", ctx.output,
  ];
  let buf = "";
  await run("ffmpeg", args, {
    cwd: ctx.outDir, timeoutMs: ctx.timeoutMs, signal: ctx.signal,
    onStdout: (c) => {
      buf += c;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m && total > 0) ctx.onProgress(Math.min(0.99, Number(m[1]) / 1_000_000 / total));
      }
    },
  });
  return [ctx.output];
};
