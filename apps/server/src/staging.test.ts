import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyStaging, createStaging, discardStaging, findStaging, getStagingDiff, worktreePathFor } from "./staging";

const tmp = mkdtempSync(join(tmpdir(), "orkestra-staging-"));
const git = (cwd: string, args: string[]) => {
  try {
    const stdout = execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Promise.resolve({ stdout, code: 0 });
  } catch (e) {
    const err = e as { stdout?: Buffer; status?: number };
    return Promise.resolve({ stdout: err.stdout?.toString() ?? "", code: err.status ?? 1 });
  }
};

function initRepo(): string {
  const dir = join(tmp, `repo-${Math.random().toString(36).slice(2, 8)}`);
  execFileSync("git", ["init", "-b", "main", dir], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "user.email", "test@test.local"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "user.name", "Test"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "commit.gpgsign", "false"], { stdio: "ignore" });
  writeFileSync(join(dir, "README.md"), "# baseline\n");
  execFileSync("git", ["-C", dir, "add", "-A"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "commit", "-m", "initial"], { stdio: "ignore" });
  return dir;
}

describe("staging", () => {
  before(() => {
    // make sure tmp exists
    if (!existsSync(tmp)) mkdtempSync(join(tmpdir(), "orkestra-staging-"));
  });

  it("createStaging: branches from HEAD and creates a worktree", async () => {
    const ws = initRepo();
    const session = await createStaging(ws, tmp, "run-1", 0, git);
    assert.equal(session.branch, "orkestra/phase-0");
    assert.equal(session.worktreePath, worktreePathFor(tmp, "run-1", 0));
    assert.ok(existsSync(session.worktreePath), "worktree dir should exist");
    // Worktree should be at the same commit as main
    const wsHead = execFileSync("git", ["-C", ws, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const wtHead = execFileSync("git", ["-C", session.worktreePath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(wsHead, wtHead);
  });

  it("createStaging: refuses if not a git repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "norepo-"));
    await assert.rejects(
      () => createStaging(dir, tmp, "run-x", 0, git),
      /not a git repository/,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("applyStaging: fast-forwards the workspace and removes the worktree", async () => {
    const ws = initRepo();
    const session = await createStaging(ws, tmp, "run-2", 1, git);
    // Simulate agent committing a change in the worktree
    writeFileSync(join(session.worktreePath, "hello.txt"), "agent work\n");
    execFileSync("git", ["-C", session.worktreePath, "add", "hello.txt"], { stdio: "ignore" });
    execFileSync("git", ["-C", session.worktreePath, "commit", "-m", "agent edit"], { stdio: "ignore" });
    // Apply
    await applyStaging(ws, session, git);
    // hello.txt should now be in the workspace
    assert.ok(existsSync(join(ws, "hello.txt")), "file should be merged into workspace");
    // Worktree + branch should be gone
    assert.equal(existsSync(session.worktreePath), false);
    const { stdout: branchList } = await git(ws, ["branch", "--list", session.branch]);
    assert.equal(branchList.trim(), "", "staging branch should be deleted");
  });

  it("discardStaging: removes the worktree and branch without touching the workspace", async () => {
    const ws = initRepo();
    const session = await createStaging(ws, tmp, "run-3", 2, git);
    writeFileSync(join(session.worktreePath, "scratch.txt"), "draft\n");
    execFileSync("git", ["-C", session.worktreePath, "add", "scratch.txt"], { stdio: "ignore" });
    execFileSync("git", ["-C", session.worktreePath, "commit", "-m", "draft"], { stdio: "ignore" });
    await discardStaging(ws, session, git);
    assert.equal(existsSync(session.worktreePath), false);
    assert.equal(existsSync(join(ws, "scratch.txt")), false, "discarded file should not appear in workspace");
  });

  it("findStaging: returns null when nothing is staged", async () => {
    const ws = initRepo();
    const found = await findStaging(ws, tmp, "run-missing", 7, git);
    assert.equal(found, null);
  });

  it("findStaging: returns the session when both worktree and branch exist", async () => {
    const ws = initRepo();
    const created = await createStaging(ws, tmp, "run-4", 3, git);
    const found = await findStaging(ws, tmp, "run-4", 3, git);
    assert.ok(found);
    assert.deepEqual(found, created);
  });

  it("getStagingDiff: returns the agent's changes vs the branch point", async () => {
    const ws = initRepo();
    const session = await createStaging(ws, tmp, "run-5", 4, git);
    writeFileSync(join(session.worktreePath, "app.ts"), "export const x = 1;\n");
    execFileSync("git", ["-C", session.worktreePath, "add", "app.ts"], { stdio: "ignore" });
    execFileSync("git", ["-C", session.worktreePath, "commit", "-m", "add app"], { stdio: "ignore" });
    const diff = await getStagingDiff(session, git);
    assert.equal(diff.length, 1);
    assert.equal(diff[0].path, "app.ts");
    assert.equal(diff[0].adds, 1);
    assert.equal(diff[0].dels, 0);
    assert.match(diff[0].diff, /\+export const x = 1;/);
  });

  it("getStagingDiff: also picks up uncommitted (intent-to-add) changes", async () => {
    const ws = initRepo();
    const session = await createStaging(ws, tmp, "run-6", 5, git);
    // Edit the existing README and add a new untracked file
    writeFileSync(join(session.worktreePath, "README.md"), "# updated\n");
    writeFileSync(join(session.worktreePath, "draft.md"), "wip\n");
    const diff = await getStagingDiff(session, git);
    const paths = diff.map((f) => f.path).sort();
    assert.deepEqual(paths, ["README.md", "draft.md"]);
  });
});

process.on("exit", () => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});
