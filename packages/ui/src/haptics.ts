/** Tiny tactile feedback where the browser allows it (Android Chrome; iOS Safari ignores it). */
export function haptic(kind: "tap" | "select" | "success" | "error" = "tap"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const pattern: Record<typeof kind, number | number[]> = {
    tap: 6,
    select: 10,
    success: [8, 40, 14],
    error: [30, 40, 30, 40, 50],
  };
  try {
    navigator.vibrate(pattern[kind]);
  } catch {
    /* ignore */
  }
}
