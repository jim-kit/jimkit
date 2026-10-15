// What can be turned into what, and by which engine. One edge covers every (from, to) pair it lists.
export type EngineId = "imagemagick" | "rsvg" | "ffmpeg" | "libreoffice" | "pandoc" | "poppler-png" | "poppler-text" | "data";

export interface Edge {
  engine: EngineId;
  from: string[];
  to: string[];
  /** quality is lost going through this edge (to a lossy target format) */
  lossyTo?: string[];
  /** added to the route cost, so slower engines lose ties */
  weight: number;
}

const IMG_IN = ["jpg", "png", "webp", "avif", "heic", "gif", "bmp", "tiff", "ico"];
const IMG_OUT = ["jpg", "png", "webp", "avif", "gif", "bmp", "tiff", "ico"];
const VIDEO = ["mp4", "mkv", "webm", "mov", "avi", "flv", "wmv"];
const VIDEO_OUT = ["mp4", "mkv", "webm", "mov", "avi"];
const AUDIO = ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "wma"];
const AUDIO_OUT = ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac"];

export const EDGES: Edge[] = [
  { engine: "imagemagick", from: IMG_IN, to: IMG_OUT, lossyTo: ["jpg", "webp", "avif", "gif"], weight: 1 },
  { engine: "rsvg", from: ["svg"], to: ["png", "pdf"], weight: 1 },
  { engine: "ffmpeg", from: VIDEO, to: VIDEO_OUT, lossyTo: VIDEO_OUT, weight: 3 },
  { engine: "ffmpeg", from: VIDEO, to: [...AUDIO_OUT, "gif"], lossyTo: ["mp3", "ogg", "opus", "m4a", "aac", "gif"], weight: 2 },
  { engine: "ffmpeg", from: AUDIO, to: AUDIO_OUT, lossyTo: ["mp3", "ogg", "opus", "m4a", "aac"], weight: 1 },
  // office documents (LibreOffice)
  { engine: "libreoffice", from: ["docx", "doc", "odt", "rtf"], to: ["pdf", "docx", "odt", "rtf", "html", "txt"], weight: 4 },
  // HTML and plain text import lose styling, so routes prefer going through ODT when there's a choice
  { engine: "libreoffice", from: ["html", "txt"], to: ["pdf", "docx", "odt", "rtf", "html", "txt"], weight: 5 },
  { engine: "libreoffice", from: ["xlsx", "xls", "ods", "csv"], to: ["pdf", "xlsx", "ods", "csv"], weight: 4 },
  { engine: "libreoffice", from: ["pptx", "ppt", "odp"], to: ["pdf", "pptx", "odp"], weight: 4 },
  // markup (pandoc, always run with --sandbox). It can't write DOCX or EPUB while sandboxed, so DOCX comes from
  // LibreOffice via ODT, and there is no EPUB or PDF output. It can still read DOCX and EPUB.
  { engine: "pandoc", from: ["md", "html", "docx", "odt", "epub", "rst", "tex", "txt"], to: ["md", "html", "odt", "rst", "tex", "txt"], weight: 2 },
  // PDFs
  { engine: "poppler-png", from: ["pdf"], to: ["png"], weight: 2 },
  { engine: "poppler-text", from: ["pdf"], to: ["txt"], lossyTo: ["txt"], weight: 1 },
  // structured data (in-process)
  { engine: "data", from: ["csv", "tsv", "json", "yaml"], to: ["csv", "tsv", "json", "yaml"], weight: 1 },
];
