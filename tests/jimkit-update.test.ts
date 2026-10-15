import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const hasGit = spawnSync("git", ["--version"]).status === 0;
const script = join(__dirname, "..", "install", "jimkit");

/** An origin repository and a checkout of it, as an install would be: the update check only needs git, not Docker. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "jk-update-"));
  const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" });
  const origin = join(dir, "origin"), work = join(dir, "work");
  mkdirSync(join(origin, "install"), { recursive: true });
  copyFileSync(script, join(origin, "install", "jimkit")); chmodSync(join(origin, "install", "jimkit"), 0o755);
  writeFileSync(join(origin, "compose.yml"), "services: {}\n");
  writeFileSync(join(origin, "package.json"), JSON.stringify({ name: "jimkit", version: "0.1.0" }, null, 2));
  git(origin, "init", "-q", "-b", "main"); git(origin, "add", "-A"); git(origin, "commit", "-qm", "First release");
  git(dir, "clone", "-q", origin, work);
  const run = (...a: string[]) => spawnSync("bash", [join(work, "install", "jimkit"), ...a], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  const publish = (version: string, subject: string) => {
    writeFileSync(join(origin, "package.json"), JSON.stringify({ name: "jimkit", version }, null, 2));
    git(origin, "commit", "-qam", subject);
  };
  return { dir, origin, work, git, run, publish };
}

const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

describe.skipIf(!hasGit)("jimkit update --check", () => {
  it("says it is up to date, and exits 0", () => {
    const s = setup(); made.push(s.dir);
    const r = s.run("update", "--check");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Up to date: Jimkit 0.1.0");
  });

  it("lists what changed and exits 10 when there is an update", () => {
    const s = setup(); made.push(s.dir);
    const head = s.git(s.work, "rev-parse", "HEAD").trim();
    s.publish("0.2.0", "Faster conversions");
    s.publish("0.2.1", "Fix the queue");
    const r = s.run("update", "--check");
    expect(r.status).toBe(10);
    expect(r.stdout).toContain("Update available: Jimkit 0.1.0 to 0.2.1");
    expect(r.stdout).toContain("Faster conversions");
    expect(r.stdout).toContain("Fix the queue");
    expect(r.stdout).toContain("(2 changes)");
    // it only looked: the checkout is exactly where it was
    expect(s.git(s.work, "rev-parse", "HEAD").trim()).toBe(head);
    expect(s.git(s.work, "status", "--porcelain").trim()).toBe("");
  });

  it("mentions work of your own without failing", () => {
    const s = setup(); made.push(s.dir);
    writeFileSync(join(s.work, "mine.txt"), "x"); s.git(s.work, "add", "-A"); s.git(s.work, "commit", "-qm", "Local change");
    const r = s.run("update", "--check");
    expect(r.status).toBe(0);
    expect(r.stderr + r.stdout).toContain("1 commit(s) ahead");
  });

  it("exits 2 with a reason when it cannot look", () => {
    const s = setup(); made.push(s.dir);
    s.git(s.work, "remote", "set-url", "origin", join(s.dir, "does-not-exist"));
    const r = s.run("update", "--check");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Could not reach the repository");
  });

  it("explains a folder that is not a git checkout", () => {
    const s = setup(); made.push(s.dir);
    rmSync(join(s.work, ".git"), { recursive: true, force: true });
    const r = s.run("update", "--check");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("not a git checkout");
  });

  it("an install from a prebuilt image says how it updates", () => {
    const s = setup(); made.push(s.dir);
    writeFileSync(join(s.work, ".env"), "JIMKIT_IMAGE=example/jimkit:full\n");
    const r = s.run("update", "--check");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("prebuilt image example/jimkit:full");
  });

  it("knows its own version and refuses unknown commands", () => {
    const s = setup(); made.push(s.dir);
    expect(s.run("version").stdout).toMatch(/^Jimkit 0\.1\.0 \(/);
    const bad = s.run("frobnicate");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("unknown command");
    expect(s.run("help").stdout).toContain("jimkit update");
  });
});

/** A fake `docker` that only records what it was asked, so `jimkit delete` can be tried without touching a real one. */
function fakeDocker(dir: string) {
  const bin = join(dir, "bin"); mkdirSync(bin, { recursive: true });
  const log = join(dir, "docker.log");
  writeFileSync(join(bin, "docker"), `#!/usr/bin/env bash\necho "$*" >> "${log}"\ncase "$*" in\n  *"config --images"*) echo jimkit:lite ;;\n  *"ps --status running"*) ;;\nesac\nexit 0\n`);
  chmodSync(join(bin, "docker"), 0o755);
  return { bin, log };
}

describe.skipIf(!hasGit)("jimkit delete", () => {
  const prep = () => {
    const s = setup(); made.push(s.dir);
    const f = fakeDocker(s.dir);
    writeFileSync(join(s.work, ".env"), "JIMKIT_SESSION_SECRET=abc\n");
    const home = join(s.dir, "home"); mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const run = (...a: string[]) => spawnSync("bash", [join(s.work, "install", "jimkit"), "delete", ...a], { encoding: "utf8", env: { ...process.env, HOME: home, PATH: `${f.bin}:${join(home, ".local", "bin")}:${process.env.PATH}` }, stdin: "ignore" } as never);
    return { ...s, f, home, run, calls: () => (existsSync(f.log) ? readFileSync(f.log, "utf8") : "") };
  };

  it("--dry-run shows the plan and changes nothing", () => {
    const s = prep();
    const r = s.run("--all", "--dry-run", "--force");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("DELETE THE DATA VOLUME");
    expect(r.stdout).toContain("DELETE THE FOLDER");
    expect(s.calls()).not.toContain("down");
    expect(existsSync(join(s.work, ".env"))).toBe(true);
  });

  it("refuses to ask without a terminal instead of deleting", () => {
    const s = prep();
    const r = s.run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("--yes");
    expect(s.calls()).not.toContain("down");
  });

  it("by default removes the container and the image, and keeps the data and the folder", () => {
    const s = prep();
    const r = s.run("--yes");
    expect(r.status).toBe(0);
    expect(s.calls()).toMatch(/compose down --remove-orphans/);
    expect(s.calls()).not.toContain("down -v");
    expect(s.calls()).toContain("image rm jimkit:lite");
    expect(existsSync(join(s.work, ".env"))).toBe(true);
    expect(readdirSync(s.home).filter((n) => n.startsWith("jimkit-removed"))).toEqual([]);
  });

  it("--data deletes the volume and saves .env first; --files removes the folder", () => {
    const s = prep();
    const r = s.run("--all", "--yes", "--force");
    expect(r.status).toBe(0);
    expect(s.calls()).toContain("down -v");
    expect(existsSync(s.work)).toBe(false);
    const kept = readdirSync(s.home).filter((n) => n.startsWith("jimkit-removed"));
    expect(kept.length).toBe(1);
    expect(readFileSync(join(s.home, kept[0], "env"), "utf8")).toContain("JIMKIT_SESSION_SECRET=abc");
  });

  it("removes the jimkit command it installed, and only that one", () => {
    const s = prep();
    symlinkSync(join(s.work, "install", "jimkit"), join(s.home, ".local", "bin", "jimkit"));
    expect(s.run("--yes").status).toBe(0);
    expect(existsSync(join(s.home, ".local", "bin", "jimkit"))).toBe(false);
  });
});

describe.skipIf(!hasGit)("jimkit delete --files and a checkout with work in it", () => {
  const prep = () => {
    const s = setup(); made.push(s.dir);
    const f = fakeDocker(s.dir);
    const home = join(s.dir, "home"); mkdirSync(home, { recursive: true });
    const run = (...a: string[]) => spawnSync("bash", [join(s.work, "install", "jimkit"), "delete", ...a], { encoding: "utf8", env: { ...process.env, HOME: home, PATH: `${f.bin}:${process.env.PATH}` }, stdin: "ignore" } as never);
    return { ...s, run };
  };

  it("refuses to delete a folder with uncommitted changes", () => {
    const s = prep();
    writeFileSync(join(s.work, "mine.txt"), "x");
    const r = s.run("--files", "--yes");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/work in it[\s\S]*uncommitted changes/);
    expect(existsSync(s.work)).toBe(true);
  });
  it("refuses to delete a folder with commits that are not on the remote", () => {
    const s = prep();
    writeFileSync(join(s.work, "mine.txt"), "x"); s.git(s.work, "add", "-A"); s.git(s.work, "commit", "-qm", "Mine");
    const r = s.run("--files", "--yes");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not on the remote/);
    expect(existsSync(s.work)).toBe(true);
  });
  it("deletes a clean checkout that matches its remote, and --force overrides the check", () => {
    const clean = prep();
    expect(clean.run("--files", "--yes").status).toBe(0);
    expect(existsSync(clean.work)).toBe(false);
    const dirty = prep();
    writeFileSync(join(dirty.work, "mine.txt"), "x");
    expect(dirty.run("--files", "--yes", "--force").status).toBe(0);
    expect(existsSync(dirty.work)).toBe(false);
  });
});
