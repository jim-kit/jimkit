import { describe, expect, it } from "vitest";
import { describeCron, nextRuns, parseCron } from "../src/lib/cron";
import { formatSize, parseInteger } from "../src/lib/numbers";
import { isoIn, zonedToEpoch } from "../src/lib/time";
import { parseUrl } from "../src/lib/url";

const cron = (text: string) => { const p = parseCron(text); if (!p.ok) throw new Error(p.error); return p.cron; };

describe("cron weekday ranges that run through Sunday", () => {
  it("name the ends as written", () => {
    expect(describeCron(cron("0 9 * * 5-7"))).toBe("At 09:00, on Friday through Sunday");
    expect(describeCron(cron("0 9 * * 6-7"))).toBe("At 09:00, on Saturday through Sunday");
    expect(describeCron(cron("0 9 * * mon-fri"))).toBe("At 09:00, on Monday through Friday");
    expect(describeCron(cron("0 9 * * 1-5"))).toBe("At 09:00, on Monday through Friday");
  });
});

describe("cron's day fields follow Vixie cron", () => {
  const from = Date.UTC(2026, 0, 1);
  const days = (text: string, n = 12) => nextRuns(cron(text), from, n, "UTC").map((t) => new Date(t).getUTCDate() + "/" + (new Date(t).getUTCDay()));
  it("a field that starts with * is a star: */2 with a weekday needs both to match", () => {
    // odd days that are also Mondays (and not "odd days, or Mondays")
    for (const r of nextRuns(cron("0 0 */2 * 1"), from, 8, "UTC")) { const d = new Date(r); expect(d.getUTCDay()).toBe(1); expect(d.getUTCDate() % 2).toBe(1); }
  });
  it("a full-range field written out is not a star: day 1 or any weekday means every day", () => {
    expect(nextRuns(cron("0 0 1 * 0-6"), from, 5, "UTC").map((t) => new Date(t).getUTCDate())).toEqual([2, 3, 4, 5, 6]);
    expect(days("0 0 1 * *", 3)).toHaveLength(3);
  });
  it("both restricted means either", () => {
    const set = new Set(nextRuns(cron("0 0 13 * 5"), from, 6, "UTC").map((t) => new Date(t).getUTCDay() === 5 || new Date(t).getUTCDate() === 13));
    expect([...set]).toEqual([true]);
  });
  it("says what */2 means", () => {
    expect(describeCron(cron("0 0 */2 * 1"))).toContain("every 2 days of the month");
    expect(describeCron(cron("0 0 * * *"))).toBe("At 00:00, every day");
  });
});

describe("URLs without a scheme", () => {
  it("read host:port as a host and a port", () => {
    for (const [text, host, port, path] of [["localhost:3000/path", "localhost", "3000", "/path"], ["example.com:8080/a?b=1", "example.com", "8080", "/a"], ["10.0.0.5:9000", "10.0.0.5", "9000", "/"]]) {
      const r = parseUrl(text);
      expect(r.ok, text).toBe(true);
      if (r.ok) expect(r.parts).toMatchObject({ hostname: host, port, pathname: path });
    }
  });
  it("still reads real schemes and bare hosts", () => {
    expect(parseUrl("mailto:me@example.org")).toMatchObject({ ok: true, parts: { protocol: "mailto:" } });
    expect(parseUrl("example.org/x")).toMatchObject({ ok: true, parts: { hostname: "example.org" } });
    expect(parseUrl("https://example.org:8443/x")).toMatchObject({ ok: true, parts: { port: "8443" } });
  });
});

describe("integers with a prefix", () => {
  it("a prefix whose digits don't fit its base was a hex digit after all", () => {
    expect(parseInteger("0bad", 16)).toMatchObject({ ok: true, value: 0xbadn });
    expect(parseInteger("0b2f", 16)).toMatchObject({ ok: true, value: 0xb2fn });
    expect(parseInteger("0b1010", 16)).toMatchObject({ ok: true, value: 10n }); // a valid binary number after 0b: the prefix wins
    expect(parseInteger("0b101", 10)).toMatchObject({ ok: true, value: 5n });
    expect(parseInteger("0x1f", 10)).toMatchObject({ ok: true, value: 31n });
    expect(parseInteger("0xff", 16)).toMatchObject({ ok: true, value: 255n });
  });
});

describe("byte sizes near a unit", () => {
  it("round up into the next unit, not to 1024 of the last", () => {
    expect(formatSize(1048575n, "iec")).toBe("1 MiB");
    expect(formatSize(999999n, "si")).toBe("1 MB");
    expect(formatSize(1536n, "iec")).toBe("1.5 KiB");
    expect(formatSize(1023n, "iec")).toBe("1023 B");
  });
});

describe("a wall time in a daylight-saving gap", () => {
  it("is read as if the clock had not been set forward (the offset from before the jump)", () => {
    const t = zonedToEpoch(2026, 3, 8, 2, 30, 0, 0, "America/New_York");
    expect(new Date(t).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(isoIn(t, "America/New_York")).toContain("03:30:00");
  });
  it("is the first of a repeated hour, and ordinary times are plain", () => {
    const repeated = zonedToEpoch(2026, 11, 1, 1, 30, 0, 0, "America/New_York");
    expect(new Date(repeated).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(new Date(zonedToEpoch(2026, 6, 1, 12, 0, 0, 0, "Europe/Budapest")).toISOString()).toBe("2026-06-01T10:00:00.000Z");
    expect(new Date(zonedToEpoch(2026, 1, 1, 12, 0, 0, 0, "UTC")).toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });
});
