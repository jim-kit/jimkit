// Every file format the converter knows, keyed by extension.
export type Kind = "image" | "video" | "audio" | "document" | "spreadsheet" | "presentation" | "data" | "ebook" | "archive" | "text";

export interface Format {
  id: string; // extension, lowercase, no dot
  label: string;
  kind: Kind;
  mime: string;
}

const f = (id: string, label: string, kind: Kind, mime: string): Format => ({ id, label, kind, mime });

export const FORMATS: Format[] = [
  // images
  f("jpg", "JPEG", "image", "image/jpeg"),
  f("png", "PNG", "image", "image/png"),
  f("webp", "WebP", "image", "image/webp"),
  f("avif", "AVIF", "image", "image/avif"),
  f("heic", "HEIC", "image", "image/heic"),
  f("gif", "GIF", "image", "image/gif"),
  f("bmp", "BMP", "image", "image/bmp"),
  f("tiff", "TIFF", "image", "image/tiff"),
  f("ico", "ICO", "image", "image/x-icon"),
  f("svg", "SVG", "image", "image/svg+xml"),
  // video
  f("mp4", "MP4", "video", "video/mp4"),
  f("mkv", "MKV", "video", "video/x-matroska"),
  f("webm", "WebM", "video", "video/webm"),
  f("mov", "MOV", "video", "video/quicktime"),
  f("avi", "AVI", "video", "video/x-msvideo"),
  f("flv", "FLV", "video", "video/x-flv"),
  f("wmv", "WMV", "video", "video/x-ms-wmv"),
  // audio
  f("mp3", "MP3", "audio", "audio/mpeg"),
  f("wav", "WAV", "audio", "audio/wav"),
  f("flac", "FLAC", "audio", "audio/flac"),
  f("ogg", "OGG Vorbis", "audio", "audio/ogg"),
  f("opus", "Opus", "audio", "audio/opus"),
  f("m4a", "M4A (AAC)", "audio", "audio/mp4"),
  f("aac", "AAC", "audio", "audio/aac"),
  f("wma", "WMA", "audio", "audio/x-ms-wma"),
  // documents
  f("pdf", "PDF", "document", "application/pdf"),
  f("docx", "Word (DOCX)", "document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  f("doc", "Word 97 (DOC)", "document", "application/msword"),
  f("odt", "OpenDocument Text", "document", "application/vnd.oasis.opendocument.text"),
  f("rtf", "Rich Text", "document", "application/rtf"),
  f("html", "HTML", "document", "text/html"),
  f("md", "Markdown", "text", "text/markdown"),
  f("txt", "Plain text", "text", "text/plain"),
  f("rst", "reStructuredText", "text", "text/x-rst"),
  f("tex", "LaTeX", "text", "application/x-tex"),
  f("epub", "EPUB", "ebook", "application/epub+zip"),
  // spreadsheets and slides
  f("xlsx", "Excel (XLSX)", "spreadsheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  f("xls", "Excel 97 (XLS)", "spreadsheet", "application/vnd.ms-excel"),
  f("ods", "OpenDocument Sheet", "spreadsheet", "application/vnd.oasis.opendocument.spreadsheet"),
  f("pptx", "PowerPoint (PPTX)", "presentation", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
  f("ppt", "PowerPoint 97 (PPT)", "presentation", "application/vnd.ms-powerpoint"),
  f("odp", "OpenDocument Slides", "presentation", "application/vnd.oasis.opendocument.presentation"),
  // data
  f("csv", "CSV", "data", "text/csv"),
  f("tsv", "TSV", "data", "text/tab-separated-values"),
  f("json", "JSON", "data", "application/json"),
  f("yaml", "YAML", "data", "application/yaml"),
  // archives (produced when a conversion yields several files)
  f("zip", "ZIP", "archive", "application/zip"),
];

const byId = new Map(FORMATS.map((x) => [x.id, x]));

/** Extensions people use that map onto one of ours. */
const ALIASES: Record<string, string> = { jpeg: "jpg", jpe: "jpg", tif: "tiff", heif: "heic", yml: "yaml", htm: "html", markdown: "md", m4v: "mp4", oga: "ogg" };

export function normalizeExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  return ALIASES[e] ?? e;
}

export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : normalizeExt(filename.slice(i + 1));
}

export const formatOf = (ext: string): Format | undefined => byId.get(normalizeExt(ext));
export const isKnown = (ext: string): boolean => byId.has(normalizeExt(ext));

export const KIND_LABEL: Record<Kind, string> = {
  image: "Images", video: "Video", audio: "Audio", document: "Documents", spreadsheet: "Spreadsheets",
  presentation: "Slides", data: "Data", ebook: "Ebooks", archive: "Archives", text: "Text",
};
