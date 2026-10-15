import { describe, expect, it } from "vitest";
import { sameOrigin } from "@/core/http";

const post = (headers: Record<string, string>) => new Request("http://jimkit.test/api/x", { method: "POST", headers });

describe("sameOrigin", () => {
  it("accepts an Origin that matches the Host", () => {
    expect(sameOrigin(post({ origin: "http://jimkit.test", host: "jimkit.test" }), 0)).toBe(true);
    expect(sameOrigin(post({ origin: "http://evil.example", host: "jimkit.test" }), 0)).toBe(false);
    expect(sameOrigin(post({ host: "jimkit.test" }), 0)).toBe(false); // no Origin at all
  });
  it("without a proxy in front X-Forwarded-Host is not believed", () => {
    // a client picking its own host to match a cross-site Origin
    const req = post({ origin: "http://evil.example", host: "jimkit.test", "x-forwarded-host": "evil.example" });
    expect(sameOrigin(req, 0)).toBe(false);
  });
  it("behind a proxy X-Forwarded-Host is the host the browser used", () => {
    const req = post({ origin: "https://jimkit.example.com", host: "127.0.0.1:3000", "x-forwarded-host": "jimkit.example.com" });
    expect(sameOrigin(req, 1)).toBe(true);
    expect(sameOrigin(req, 0)).toBe(false);
  });
});
