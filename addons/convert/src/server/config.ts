/** Limits specific to conversion. The shared ones (retention, disk cap, global concurrency) belong to the host. */
export const MAX_ACTIVE_JOBS_PER_CLIENT = 100;
/** pages rendered from a PDF, to bound work and output size */
export const MAX_PDF_PAGES = 300;
/** data conversions run in memory inside the server (a parsed CSV is many times its size), so they are capped well below the upload limit */
export const MAX_DATA_BYTES = 16 * 1024 * 1024;
/** the most any one conversion may write: a few seconds of audio can become hours of silence as WAV, and the disk is shared */
export const MAX_OUTPUT_BYTES = 4 * 1024 ** 3;
/** pixels on the longest side of a rendered page or SVG: 1.3 GB of memory per page at 10000 x 10000 is not a thumbnail */
export const MAX_RENDER_SIDE = 7000;

/** an upload that sends nothing for this long is dropped, so a stalled connection doesn't hold its disk reservation for ever */
export const UPLOAD_IDLE_MS = 2 * 60_000;

/** Set once from the host's context when the addon starts. */
export const settings = { threads: 3, dataDir: "/tmp/jimkit-convert" };
