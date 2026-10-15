export interface FileKind {
  kind: "image" | "video" | "audio" | "document" | "archive" | "data" | "ebook" | "other";
  label: string;
  icon: string;
  hue: number;
}

const EXT: Record<string, FileKind["kind"]> = {};
const add = (kind: FileKind["kind"], exts: string) => exts.split(" ").forEach((e) => (EXT[e] = kind));
add("image", "jpg jpeg png gif webp avif heic heif bmp tif tiff svg ico raw cr2 nef arw dng psd");
add("video", "mp4 mkv webm mov avi flv wmv m4v mpg mpeg ts 3gp");
add("audio", "mp3 flac wav aac ogg opus m4a wma aiff");
add("document", "pdf doc docx odt rtf txt md html htm tex ppt pptx odp");
add("archive", "zip 7z rar tar gz bz2 xz tgz zst");
add("data", "csv json yaml yml xml xls xlsx ods sqlite db parquet tsv");
add("ebook", "epub mobi azw azw3 fb2");

const META: Record<FileKind["kind"], Omit<FileKind, "kind">> = {
  image: { label: "Image", icon: "Image", hue: 35 },
  video: { label: "Video", icon: "Film", hue: 15 },
  audio: { label: "Audio", icon: "Music", hue: 340 },
  document: { label: "Document", icon: "FileText", hue: 195 },
  archive: { label: "Archive", icon: "Archive", hue: 75 },
  data: { label: "Data", icon: "Database", hue: 180 },
  ebook: { label: "Ebook", icon: "BookOpen", hue: 140 },
  other: { label: "File", icon: "File", hue: 60 },
};

export function detectKind(name: string, mime: string): FileKind {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  let kind = EXT[ext];
  if (!kind) {
    if (mime.startsWith("image/")) kind = "image";
    else if (mime.startsWith("video/")) kind = "video";
    else if (mime.startsWith("audio/")) kind = "audio";
    else kind = "other";
  }
  return { kind, ...META[kind] };
}

export function extensionOf(name: string): string {
  return name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 5) : "FILE";
}
