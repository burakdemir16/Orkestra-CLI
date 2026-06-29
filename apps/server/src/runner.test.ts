import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Runner } from "./runner";
import { Store } from "./db";
import { EventHub } from "./events";
import { createStaging, findStaging, applyStaging, discardStaging } from "./staging";
import { GitService } from "./git";

// In-memory event hub for the test (no-op — Runner only calls publish()).
class TestHub extends EventHub {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override publish(_event: any) {}
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "orkestra-runner-"));
  execFileSync("git", ["init", "-b", "main", dir], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "user.email", "test@test.local"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "user.name", "Test"], { stdio: "ignore" });
  execFileSync("git", ["-C", dir, "config", "commit.gpgsign", "false"], { stdio: "ignore" });
  // Need a baseline so the worktree can branch from a non-empty commit.
  execFileSync("git", ["-C", dir, "commit", "--allow-empty", "-m", "init"], { stdio: "ignore" });
  return dir;
}

function makeRun(store: Store, workspacePath: string) {
  const run = {
    id: `run-${Math.random().toString(36).slice(2, 8)}`,
    prompt: "test prompt",
    status: "queued" as const,
    workspacePath,
    createdAt: new Date().toISOString(),
    completedAt: null,
    activeStep: null,
    summary: null,
    preWriteApproval: true,
    pendingPhase: null,
  };
  store.createRun(run);
  return run;
}

const tmp = mkdtempSync(join(tmpdir(), "orkestra-runner-suite-"));
const stagingRoot = join(tmp, "staging");

describe("runner pre-write approval", () => {
  let store: Store;
  let runner: Runner;

  before(() => {
    // ponytail: in-memory store; the test repo's dataDir is just for shape.
    store = new Store({ host: "127.0.0.1", port: 0, dataDir: join(tmp, "data"), workspaceDir: join(tmp, "ws") });
    runner = new Runner(store, new TestHub(), { stagingRoot });
  });

  it("applyPendingPhase returns true and fires approve when a control is waiting", () => {
    const ws = makeRepo();
    const run = makeRun(store, ws);
    // Inject a control with an approve callback, bypassing the live run loop.
    // ponytail: this is the only public path to set a control from outside the class.
    (runner as unknown as { controls: Map<string, unknown> }).controls.set(run.id, {
      notes: [],
      stop: false,
      children: new Set(),
      approve: () => {},
    });
    const fired: string[] = [];
    (runner as unknown as { controls: Map<string, { approve?: () => void; discard?: () => void }> }).controls.get(run.id)!.approve = () => fired.push("approve");
    const ok = runner.applyPendingPhase(run.id);
    assert.equal(ok, true);
    assert.deepEqual(fired, ["approve"]);
    // The callback must be one-shot.
    const ok2 = runner.applyPendingPhase(run.id);
    assert.equal(ok2, false, "second call without re-arming should be a no-op");
  });

  it("discardPendingPhase returns true and fires discard when a control is waiting", () => {
    const ws = makeRepo();
    const run = makeRun(store, ws);
    (runner as unknown as { controls: Map<string, Record<string, unknown>> }).controls.set(run.id, {
      notes: [],
      stop: false,
      children: new Set(),
    });
    const fired: string[] = [];
    (runner as unknown as { controls: Map<string, { discard?: () => void }> }).controls.get(run.id)!.discard = () => fired.push("discard");
    const ok = runner.discardPendingPhase(run.id);
    assert.equal(ok, true);
    assert.deepEqual(fired, ["discard"]);
  });

  it("apply/discard return false when no control is registered (run already done)", () => {
    const ws = makeRepo();
    const run = makeRun(store, ws);
    // No control set
    assert.equal(runner.applyPendingPhase(run.id), false);
    assert.equal(runner.discardPendingPhase(run.id), false);
  });

  it("end-to-end: staging → apply merges the agent's work into the workspace", async () => {
    const ws = makeRepo();
    const run = makeRun(store, ws);
    // Create staging manually (simulating the runner's per-phase createStaging call).
    const session = await createStaging(ws, stagingRoot, run.id, 0);
    // Simulate the agent committing inside the worktree.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(session.worktreePath, "feature.txt"), "new feature\n");
    execFileSync("git", ["-C", session.worktreePath, "add", "feature.txt"], { stdio: "ignore" });
    execFileSync("git", ["-C", session.worktreePath, "commit", "-m", "add feature"], { stdio: "ignore" });
    // Apply
    await applyStaging(ws, session);
    // The workspace now has the new file
    assert.ok(existsSync(join(ws, "feature.txt")), "applied file should be in workspace");
    // And the staging session is gone
    const after = await findStaging(ws, stagingRoot, run.id, 0);
    assert.equal(after, null);
  });

  it("end-to-end: staging → discard leaves the workspace untouched", async () => {
    const ws = makeRepo();
    const run = makeRun(store, ws);
    const session = await createStaging(ws, stagingRoot, run.id, 1);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(session.worktreePath, "scratch.txt"), "draft\n");
    execFileSync("git", ["-C", session.worktreePath, "add", "scratch.txt"], { stdio: "ignore" });
    execFileSync("git", ["-C", session.worktreePath, "commit", "-m", "draft"], { stdio: "ignore" });
    await discardStaging(ws, session);
    assert.equal(existsSync(join(ws, "scratch.txt")), false, "discarded file should not be in workspace");
  });

  it("end-to-end: GitService baseline + staging still works on top of an existing repo", async () => {
    const ws = makeRepo();
    // GitService.commitBaseline is what /api/runs does before kicking off the runner.
    await new GitService(ws).commitBaseline();
    const session = await createStaging(ws, stagingRoot, "baseline-test", 0);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(session.worktreePath, "after-baseline.txt"), "ok\n");
    execFileSync("git", ["-C", session.worktreePath, "add", "after-baseline.txt"], { stdio: "ignore" });
    execFileSync("git", ["-C", session.worktreePath, "commit", "-m", "x"], { stdio: "ignore" });
    await applyStaging(ws, session);
    assert.ok(existsSync(join(ws, "after-baseline.txt")));
  });
});

process.on("exit", () => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});
