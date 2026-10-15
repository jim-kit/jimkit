import { describe, expect, it } from "vitest";
import { describeCron, nextRuns, parseCron } from "../src/lib/cron";

const ms = (iso: string) => Date.parse(iso);
const cron = (s: string) => { const p = parseCron(s); if (!p.ok) throw new Error(p.error); return p.cron; };
const runs = (s: string, from: string, n: number, zone = "UTC") => nextRuns(cron(s), ms(from), n, zone).map((t) => new Date(t).toISOString().slice(0, 16) + "Z");

describe("parsing", () => {
  it("expands lists, ranges, steps and names", () => {
    expect(cron("*/15 * * * *").minute.values).toEqual([0, 15, 30, 45]);
    expect(cron("10-30/10 * * * *").minute.values).toEqual([10, 20, 30]);
    expect(cron("5/20 * * * *").minute.values).toEqual([5, 25, 45]);
    expect(cron("0 9,17 * * *").hour.values).toEqual([9, 17]);
    expect(cron("0 0 * JAN,mar *").month.values).toEqual([1, 3]);
    expect(cron("0 0 * * MON-FRI").dow.values).toEqual([1, 2, 3, 4, 5]);
    expect(cron("0 0 * * 7").dow.values).toEqual([0]);
    expect(cron("0 0 * * 0,7").dow.values).toEqual([0]);
    expect(cron("0 0 * * *").dow.any).toBe(true);
    expect(cron("0 0 * * 1-5").dow.any).toBe(false);
    expect(cron("@daily").hour.values).toEqual([0]);
  });

  it("names the field that is wrong", () => {
    const bad = (s: string) => { const p = parseCron(s); return p.ok ? "ok" : p.error; };
    expect(bad("61 * * * *")).toMatch(/^Minute: 61 is outside 0-59/);
    expect(bad("* 24 * * *")).toMatch(/^Hour: 24/);
    expect(bad("* * 0 * *")).toMatch(/^Day of month: 0/);
    expect(bad("* * * 13 *")).toMatch(/^Month: 13/);
    expect(bad("* * * * 8")).toMatch(/^Day of week: 8/);
    expect(bad("* * *")).toMatch(/^Expected 5 fields .* found 3$/);
    expect(bad("5-1 * * * *")).toMatch(/backwards/);
    expect(bad("*/0 * * * *")).toMatch(/step/);
    expect(bad("a * * * *")).toMatch(/not a number/);
    expect(bad("0 0 L * *")).toMatch(/L, W or #/);
    expect(bad("@sometimes")).toMatch(/not a known shortcut/);
    expect(bad("")).toMatch(/Enter/);
  });
});

describe("next runs", () => {
  it("steps through minutes", () => {
    expect(runs("*/15 * * * *", "2024-03-09T14:05:09Z", 4)).toEqual(["2024-03-09T14:15Z", "2024-03-09T14:30Z", "2024-03-09T14:45Z", "2024-03-09T15:00Z"]);
  });
  it("is strictly after the start", () => {
    expect(runs("0 * * * *", "2024-03-09T14:00:00Z", 1)).toEqual(["2024-03-09T15:00Z"]);
  });
  it("skips the weekend", () => {
    expect(runs("0 9 * * 1-5", "2024-03-08T10:00:00Z", 3)).toEqual(["2024-03-11T09:00Z", "2024-03-12T09:00Z", "2024-03-13T09:00Z"]);
  });
  it("finds February 29th", () => {
    expect(runs("0 0 29 2 *", "2023-03-01T00:00:00Z", 2)).toEqual(["2024-02-29T00:00Z", "2028-02-29T00:00Z"]);
  });
  it("matches day of month OR day of week when both are set", () => {
    // the 13th, or any Friday
    expect(runs("0 0 13 * 5", "2024-09-01T00:00:00Z", 5)).toEqual(["2024-09-06T00:00Z", "2024-09-13T00:00Z", "2024-09-20T00:00Z", "2024-09-27T00:00Z", "2024-10-04T00:00Z"]);
  });
  it("works in another zone", () => {
    expect(runs("30 9 * * *", "2024-01-15T00:00:00Z", 2, "Asia/Kolkata")).toEqual(["2024-01-15T04:00Z", "2024-01-16T04:00Z"]);
  });
  it("leaves out a time the clock skips and runs a repeated hour once", () => {
    // 02:30 on 2024-03-10 does not exist in New York, so that day has no run
    expect(runs("30 2 * * *", "2024-03-09T12:00:00Z", 3, "America/New_York")).toEqual(["2024-03-11T06:30Z", "2024-03-12T06:30Z", "2024-03-13T06:30Z"]);
    // 2024-11-03 01:30 happens twice in New York (EDT then EST): one run, the first
    expect(runs("30 1 * * *", "2024-11-02T12:00:00Z", 2, "America/New_York")).toEqual(["2024-11-03T05:30Z", "2024-11-04T06:30Z"]);
  });
  it("returns nothing for a date that never comes", () => {
    expect(runs("0 0 31 2 *", "2024-01-01T00:00:00Z", 3)).toEqual([]);
  });
});

describe("description", () => {
  const say = (s: string) => describeCron(cron(s));
  it("reads like a sentence", () => {
    expect(say("30 9 * * *")).toBe("At 09:30, every day");
    expect(say("0 9 * * 1-5")).toBe("At 09:00, on Monday through Friday");
    expect(say("*/15 * * * *")).toBe("Every 15 minutes, every day");
    expect(say("* * * * *")).toBe("Every minute, every day");
    expect(say("0 0 1 * *")).toBe("At 00:00, on day 1 of the month");
    expect(say("0 0 1 1 *")).toBe("At 00:00, on day 1 of the month in January");
    expect(say("0 9,17 * * 0")).toBe("At minute 0, at hours 9 and 17, on Sunday");
    expect(say("0 9-17 * * *")).toBe("At minute 0, between 09:00 and 17:59, every day");
    expect(say("0 0 13 * 5")).toBe("At 00:00, on day 13 of the month, or on Friday");
    expect(say("0 0 * 6,12 *")).toBe("At 00:00, every day in June and December");
    expect(say("15 */2 * * *")).toBe("At minute 15, every 2 hours, every day");
  });
});
