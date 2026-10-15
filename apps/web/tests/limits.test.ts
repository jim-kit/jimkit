import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, mergeLimits, parseBytes, parseSeconds } from "../src/core/limits";

const GB = 1024 ** 3;

describe("sizes in the config file", () => {
  it("reads units, in any case, with or without the B", () => {
    expect(parseBytes("16k")).toBe(16 * 1024);
    expect(parseBytes("16KB")).toBe(16 * 1024);
    expect(parseBytes("512 MB")).toBe(512 * 1024 ** 2);
    expect(parseBytes("5g")).toBe(5 * GB);
    expect(parseBytes("1.5GB")).toBe(1.5 * GB);
    expect(parseBytes("2TiB")).toBe(2 * 1024 ** 4);
    expect(parseBytes("100B")).toBe(100);
    expect(parseBytes("100")).toBe(100);
  });
  it("still takes a plain number of bytes", () => {
    expect(parseBytes(536870912)).toBe(536870912);
  });
  it("refuses what it cannot read", () => {
    for (const bad of ["", "five", "5 gigs", "-1", "GB", "5 GB extra", NaN, -1, {}, [], true]) expect(parseBytes(bad)).toBeUndefined();
  });
});

describe("times in the config file", () => {
  it("reads seconds, minutes and hours", () => {
    expect([parseSeconds("90"), parseSeconds("90s"), parseSeconds("30m"), parseSeconds("2h"), parseSeconds("1.5h"), parseSeconds(600)]).toEqual([90, 90, 1800, 7200, 5400, 600]);
    expect(parseSeconds("soon")).toBeUndefined();
  });
});

describe("per-tier limits from the config file", () => {
  it("accepts readable sizes and times and leaves everything else alone", () => {
    const l = mergeLimits({ public: { maxFileBytes: "512MB", dailyBytes: "2G", jobTimeoutSec: "10m", concurrentJobs: 3 }, trusted: { maxBatchBytes: "20GB" } });
    expect(l.public).toMatchObject({ maxFileBytes: 512 * 1024 ** 2, dailyBytes: 2 * GB, jobTimeoutSec: 600, concurrentJobs: 3, maxFiles: DEFAULT_LIMITS.public.maxFiles });
    expect(l.trusted.maxBatchBytes).toBe(20 * GB);
    expect(l.trusted.maxFileBytes).toBe(DEFAULT_LIMITS.trusted.maxFileBytes);
  });
  it("still takes numbers and null, and ignores values it cannot read", () => {
    const l = mergeLimits({ public: { maxFileBytes: 1000, dailyBytes: null, bandwidthMbit: null }, unlocked: { maxFileBytes: "lots", concurrentJobs: "many" } });
    expect(l.public).toMatchObject({ maxFileBytes: 1000, dailyBytes: null, bandwidthMbit: null });
    expect(l.unlocked.maxFileBytes).toBe(DEFAULT_LIMITS.unlocked.maxFileBytes);
    expect(l.unlocked.concurrentJobs).toBe(DEFAULT_LIMITS.unlocked.concurrentJobs);
  });
});
