import { describe, expect, it } from "vitest";
import type { RegistryKit } from "@/core/store/types";
import { matchKits, reviewPage, reviewUrl, sourceFromQuery, updateFor } from "@/ui/kits-util";

const kit = (over: Partial<RegistryKit>): RegistryKit => ({ repo: "ada/word-count", name: "Word count", description: "Counts words.", tools: [{ name: "Word count", blurb: "Counts", icon: "PenLine" }], latest: "1.2.0", versions: [], rating: null, reviews: [], ...over });

describe("matchKits", () => {
  const kits = [kit({}), kit({ repo: "grace/cron-helper", name: "Cron helper", description: "Explains cron lines.", tools: [{ name: "Cron", blurb: "x", icon: "Timer" }], rating: { average: 4.8, count: 9 } })];
  it("finds by any word, in names, authors and descriptions", () => {
    expect(matchKits(kits, "cron").map((k) => k.repo)).toEqual(["grace/cron-helper"]);
    expect(matchKits(kits, "grace").map((k) => k.repo)).toEqual(["grace/cron-helper"]);
    expect(matchKits(kits, "words counts").map((k) => k.repo)).toEqual(["ada/word-count"]);
  });
  it("lists the best rated first and everything for an empty query", () => {
    expect(matchKits(kits, "").map((k) => k.repo)).toEqual(["grace/cron-helper", "ada/word-count"]);
  });
});

describe("sourceFromQuery", () => {
  it.each(["ada/word-count", "https://github.com/ada/word-count", "github.com/ada/word-count.git", "ada/word-count@1.2.0"])("takes %s as a source", (q) => expect(sourceFromQuery(q)).toBe(q));
  it.each(["word count", "cron", "", "https://evil.example/ada/x", "a/b/c"])("takes %j as words to search for", (q) => expect(sourceFromQuery(q)).toBeNull());
});

describe("updateFor", () => {
  const installed = { id: "word-count", repo: "ada/word-count", version: "1.0.0", name: "Word count", description: "", installedAt: 0 };
  it("offers a newer registry version only", () => {
    expect(updateFor(installed, [kit({ latest: "1.2.0" })])).toBe("1.2.0");
    expect(updateFor({ ...installed, version: "1.2.0" }, [kit({ latest: "1.2.0" })])).toBeNull();
    expect(updateFor(installed, [])).toBeNull();
  });
});

describe("reviewPage", () => {
  it("sends a review of the project's registry to its website, where reviewers sign in with GitHub", () => {
    expect(reviewPage("jim-kit/registry", "Ada/Word-Count")).toBe("https://jimkit.thejimmy.dev/kits/ada/word-count/#review");
  });
  it("leaves another registry on the pull-request way", () => {
    expect(reviewPage("someone/registry", "ada/word-count")).toBeNull();
    expect(reviewPage("jim-kit/registry", "nonsense")).toBeNull();
  });
});

describe("reviewUrl", () => {
  it("opens GitHub's new-file page for the reviewer's own file in the registry repository", () => {
    const u = new URL(reviewUrl("jim-kit/registry", "Ada/Word-Count", "Grace", { rating: 4, text: " Good. ", version: "1.2.0" })!);
    expect(u.origin + u.pathname).toBe("https://github.com/jim-kit/registry/new/main");
    expect(u.searchParams.get("filename")).toBe("reviews/ada/word-count/grace.json");
    expect(JSON.parse(u.searchParams.get("value")!)).toEqual({ rating: 4, version: "1.2.0", text: "Good." });
  });
  it("clamps the rating and refuses a reviewer name that isn't a GitHub username", () => {
    expect(JSON.parse(new URL(reviewUrl("a/b", "ada/x", "grace", { rating: 9, text: "" })!).searchParams.get("value")!).rating).toBe(5);
    expect(reviewUrl("a/b", "ada/x", "not a name", { rating: 3, text: "" })).toBeNull();
    expect(reviewUrl("a/b", "nonsense", "grace", { rating: 3, text: "" })).toBeNull();
  });
});
