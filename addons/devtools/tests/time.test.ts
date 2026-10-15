import { describe, expect, it } from "vitest";
import { dateDiff, describeDiff, isoIn, offsetLabel, parseInstant, readableIn, relative, rfc2822In, zoneOffset, zonedToEpoch } from "../src/lib/time";

const ms = (iso: string) => Date.parse(iso);

describe("zones", () => {
  it("knows offsets, including daylight saving", () => {
    expect(zoneOffset(ms("2024-01-15T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(zoneOffset(ms("2024-07-15T12:00:00Z"), "America/New_York")).toBe(-240);
    expect(zoneOffset(ms("2024-01-15T12:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(zoneOffset(ms("2024-01-15T12:00:00Z"), "UTC")).toBe(0);
    expect(offsetLabel(330)).toBe("+05:30");
    expect(offsetLabel(-300, false)).toBe("-0500");
  });

  it("turns wall-clock time in a zone back into an instant", () => {
    expect(zonedToEpoch(2024, 1, 15, 12, 0, 0, 0, "Asia/Kolkata")).toBe(ms("2024-01-15T06:30:00Z"));
    expect(zonedToEpoch(2024, 3, 10, 12, 0, 0, 0, "America/New_York")).toBe(ms("2024-03-10T16:00:00Z")); // after the spring change
    expect(zonedToEpoch(2024, 3, 9, 12, 0, 0, 0, "America/New_York")).toBe(ms("2024-03-09T17:00:00Z")); // before it
    // 01:30 happens twice on 2024-11-03 in New York: the first one is still EDT
    expect(zonedToEpoch(2024, 11, 3, 1, 30, 0, 0, "America/New_York")).toBe(ms("2024-11-03T05:30:00Z"));
  });

  it("formats an instant", () => {
    const t = ms("2024-03-09T14:05:09.120Z");
    expect(isoIn(t, "UTC")).toBe("2024-03-09T14:05:09.120Z");
    expect(isoIn(t, "Asia/Kolkata")).toBe("2024-03-09T19:35:09.120+05:30");
    expect(rfc2822In(t, "UTC")).toBe("Sat, 09 Mar 2024 14:05:09 +0000");
    expect(rfc2822In(t, "America/New_York")).toBe("Sat, 09 Mar 2024 09:05:09 -0500");
    expect(readableIn(t, "UTC")).toMatch(/^Saturday, 9 March 2024, 14:05:09 UTC$/);
  });
});

describe("parsing", () => {
  it("guesses the unit of a Unix timestamp from its size", () => {
    const want = ms("2024-03-09T14:05:09Z");
    expect(parseInstant("1709993109", "UTC")).toMatchObject({ ok: true, ms: want, how: "Unix seconds" });
    expect(parseInstant("1709993109000", "UTC")).toMatchObject({ ok: true, ms: want, how: "Unix milliseconds" });
    expect(parseInstant("1709993109000000", "UTC")).toMatchObject({ ok: true, ms: want, how: "Unix microseconds" });
    expect(parseInstant("1709993109000000000", "UTC")).toMatchObject({ ok: true, ms: want, how: "Unix nanoseconds" });
    expect(parseInstant("0", "UTC")).toMatchObject({ ok: true, ms: 0 });
    expect(parseInstant("-86400", "UTC")).toMatchObject({ ok: true, ms: -86400000 });
    expect(parseInstant("1709993109", "UTC", "ms")).toMatchObject({ ok: true, ms: 1709993109 });
  });

  it("reads dates in the chosen zone unless they carry their own offset", () => {
    expect(parseInstant("2024-01-15 12:00", "Asia/Kolkata")).toMatchObject({ ok: true, ms: ms("2024-01-15T06:30:00Z") });
    expect(parseInstant("2024-01-15T12:00:00Z", "Asia/Kolkata")).toMatchObject({ ok: true, ms: ms("2024-01-15T12:00:00Z") });
    expect(parseInstant("Sat, 09 Mar 2024 14:05:09 +0100", "UTC")).toMatchObject({ ok: true, ms: ms("2024-03-09T13:05:09Z") });
    expect(parseInstant("2024-01-15", "UTC")).toMatchObject({ ok: true, ms: ms("2024-01-15T00:00:00Z") });
  });

  it("says what is wrong", () => {
    expect(parseInstant("", "UTC").ok).toBe(false);
    expect(parseInstant("2024-02-30", "UTC")).toMatchObject({ ok: false });
    expect(parseInstant("2024-13-01", "UTC")).toMatchObject({ ok: false });
    expect(parseInstant("tomorrow-ish", "UTC")).toMatchObject({ ok: false });
    expect(parseInstant("9".repeat(40), "UTC").ok).toBe(false);
  });
});

describe("relative time", () => {
  const now = ms("2024-03-09T12:00:00Z");
  it("picks a sensible unit", () => {
    expect(relative(now + 3 * 86400e3, now)).toBe("in 3 days");
    expect(relative(now - 2 * 3600e3, now)).toBe("2 hours ago");
    expect(relative(now + 90e3, now)).toBe("in 1 minute");
    expect(relative(now - 400, now)).toBe("now");
    expect(relative(now + 400 * 86400e3, now)).toBe("next year");
  });
});

describe("date difference", () => {
  const z = "UTC";
  it("counts calendar months with end-of-month clamping", () => {
    expect(dateDiff(ms("2024-01-31T00:00:00Z"), ms("2024-03-01T00:00:00Z"), z)).toMatchObject({ years: 0, months: 1, days: 1 });
    expect(dateDiff(ms("2020-02-29T00:00:00Z"), ms("2021-02-28T00:00:00Z"), z)).toMatchObject({ years: 1, months: 0, days: 0 });
    expect(dateDiff(ms("2000-01-01T00:00:00Z"), ms("2024-03-09T14:05:09Z"), z)).toMatchObject({ years: 24, months: 2, days: 8, hours: 14, minutes: 5, seconds: 9 });
  });
  it("is symmetric and keeps the sign", () => {
    const d = dateDiff(ms("2024-03-09T00:00:00Z"), ms("2024-03-01T00:00:00Z"), z);
    expect(d).toMatchObject({ negative: true, days: 8 });
    expect(d.totalMs).toBe(8 * 86400e3);
    expect(describeDiff(d)).toBe("8 days");
    expect(describeDiff(dateDiff(1, 1, z))).toBe("No difference");
  });
  it("uses the zone's calendar", () => {
    // 23:00 UTC on Dec 31 is already Jan 1 in Tokyo
    expect(dateDiff(ms("2023-12-31T23:00:00Z"), ms("2024-01-02T00:00:00Z"), "Asia/Tokyo")).toMatchObject({ days: 1, hours: 1 });
  });
});
