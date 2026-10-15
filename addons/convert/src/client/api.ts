import type { JobView } from "../server/types";

const BASE = "/api/a/convert";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export interface UploadResult {
  id: string;
  name: string;
  ext: string;
  size: number;
}

/** PUT the raw file with real progress events (fetch can't report upload progress). */
export function uploadFile(file: File, onProgress: (p: number) => void, signal?: AbortSignal): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${BASE}/upload?name=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string; code?: string } & Partial<UploadResult> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status === 200 && body.id) return resolve(body as UploadResult);
      reject(new ApiError(body.error ?? friendly(xhr.status, body.code), xhr.status, body.code));
    };
    xhr.onerror = () => reject(new ApiError("Couldn't reach the server.", 0));
    xhr.onabort = () => reject(new ApiError("Cancelled.", 0, "aborted"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

function friendly(status: number, code?: string): string {
  if (code === "unknown_upload" || status === 404) return "That upload expired or was removed. Add the file again.";
  if (status === 403) return "The request was blocked. Reload the page and try again.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "The server had a problem. Try again in a moment.";
  return "Something went wrong.";
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? friendly(res.status, body.code), res.status, body.code);
  return body as T;
}

export interface ConvertRequest { uploadId: string; to: string; level: "low" | "balanced" | "high"; maxDim: number }

export async function startJobs(items: ConvertRequest[]): Promise<JobView[]> {
  const res = await fetch(`${BASE}/convert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
  return (await json<{ jobs: JobView[] }>(res)).jobs;
}

export async function pollJobs(ids: string[]): Promise<JobView[]> {
  if (!ids.length) return [];
  const res = await fetch(`${BASE}/jobs?ids=${ids.join(",")}`, { cache: "no-store" });
  return (await json<{ jobs: JobView[] }>(res)).jobs;
}

export const removeJob = (id: string) => fetch(`${BASE}/jobs/${id}`, { method: "DELETE" }).catch(() => {});
export const removeUpload = (id: string) => fetch(`${BASE}/upload/${id}`, { method: "DELETE" }).catch(() => {});
export const downloadHref = (jobId: string) => `${BASE}/jobs/${jobId}/download`;
export const zipHref = (jobIds: string[]) => `${BASE}/jobs/zip?ids=${jobIds.join(",")}`;
