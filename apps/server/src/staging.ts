import { execFile, execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { DiffFile } from "./git";

const exec = promisify(execFileCb);

// Pre-write diff approval: per-phase git worktree as a staging area.
// The agent runs in the worktree (not the main workspace). On apply,
// the staging branch is fast-forward-merged into the workspace's current
// branch. On discard, the worktree + branch are removed.
//
// File layout: <stagingRoot>/<runId>/phase-<n>
//   - worktreePath = stagingRoot/runId/phase-n  (the live working tree)
//   - branch       = orkestra/phase-<n>        (per-phase branch)
//
// We never write into the workspace until the user approves.

export type StagingSession = {
  runId: string;
  phaseIndex: number;
  branch: string;
  worktreePath: string;
  baseCommit: string;
};

export type GitRunner = (cwd: string, args: string[], stdin?: string) => Promise<{ stdout: string; code: number }>;

const defaultGit: GitRunner = async (cwd, args) => {
  try {
    const { stdout } = await exec("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return { stdout, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; code?: number };
    return { stdout: err.stdout ?? "", code: err.code ?? 1 };
  }
};

export function branchName(phaseIndex: number): string {
  return `orkestra/phase-${phaseIndex}`;
}

export function worktreePathFor(stagingRoot: string, runId: string, phaseIndex: number): string {
  return join(stagingRoot, runId, `phase-${phaseIndex}`);
}

/**
 * Create a new staging worktree branched from the workspace's current HEAD.
 * Throws if a worktree with the same branch already exists, or if the
 * workspace is not a git repository.
 */
export async function createStaging(
  workspacePath: string,
  stagingRoot: string,
  runId: string,
  phaseIndex: number,
  git: GitRunner = defaultGit
): Promise<StagingSession> {
  const branch = branchName(phaseIndex);
  const worktreePath = worktreePathFor(stagingRoot, runId, phaseIndex);
  if (existsSync(worktreePath)) {
    throw new Error(`Staging worktree already exists: ${worktreePath}`);
  }
  const { code: revParse } = await git(workspacePath, ["rev-parse", "--git-dir"]);
  if (revParse !== 0) {
    throw new Error(`Workspace is not a git repository: ${workspacePath}`);
  }
  const { code, stdout } = await git(workspacePath, [
    "worktree", "add", "-b", branch, worktreePath, "HEAD",
  ]);
  if (code !== 0) {
    throw new Error(`git worktree add failed for phase ${phaseIndex}: ${stdout}`);
  }
  // Capture the base commit so getStagingDiff can compare against the exact
  // point the branch was created — even if the worktree's HEAD has advanced.
  const { stdout: baseCommit, code: baseCode } = await git(workspacePath, ["rev-parse", "HEAD"]);
  if (baseCode !== 0 || !baseCommit.trim()) {
    throw new Error(`Failed to read base commit for phase ${phaseIndex}.`);
  }
  return { runId, phaseIndex, branch, worktreePath, baseCommit: baseCommit.trim() };
}

/**
 * Apply: fast-forward the workspace's current branch to the staging branch,
 * then remove the worktree and delete the staging branch.
 * Throws if fast-forward is not possible (i.e. the workspace moved on).
 */
export async function applyStaging(
  workspacePath: string,
  session: StagingSession,
  git: GitRunner = defaultGit
): Promise<void> {
  const { code: mergeCode, stdout: mergeOut } = await git(workspacePath, [
    "merge", "--ff-only", session.branch,
  ]);
  if (mergeCode !== 0) {
    throw new Error(
      `Fast-forward merge failed (workspace may have advanced): ${mergeOut}. ` +
      `Resolve manually with \`git merge ${session.branch}\` from ${workspacePath}.`
    );
  }
  await cleanup(workspacePath, session, git);
}

/**
 * Discard: drop the worktree and the branch without touching the workspace.
 */
export async function discardStaging(
  workspacePath: string,
  session: StagingSession,
  git: GitRunner = defaultGit
): Promise<void> {
  await cleanup(workspacePath, session, git);
}

async function cleanup(workspacePath: string, session: StagingSession, git: GitRunner) {
  await git(workspacePath, ["worktree", "remove", "--force", session.worktreePath]);
  await git(workspacePath, ["branch", "-D", session.branch]);
}

/**
 * Detect an existing staging session for a given (runId, phaseIndex).
 * Returns the session if both the worktree and the branch are present.
 */
export async function findStaging(
  workspacePath: string,
  stagingRoot: string,
  runId: string,
  phaseIndex: number,
  git: GitRunner = defaultGit
): Promise<StagingSession | null> {
  const branch = branchName(phaseIndex);
  const worktreePath = worktreePathFor(stagingRoot, runId, phaseIndex);
  if (!existsSync(worktreePath)) return null;
  const { code, stdout } = await git(workspacePath, ["branch", "--list", branch]);
  if (code !== 0 || !stdout.trim()) return null;
  // Re-derive the base commit:
  // - if the branch already has commits, use the parent of its tip
  // - otherwise the branch still points at the workspace HEAD; capture that
  const { code: parentCode, stdout: parentOut } = await git(workspacePath, ["rev-parse", `${branch}^`]);
  let baseCommit: string;
  if (parentCode === 0 && parentOut.trim()) {
    baseCommit = parentOut.trim();
  } else {
    const { stdout: headOut } = await git(workspacePath, ["rev-parse", branch]);
    baseCommit = headOut.trim();
  }
  return { runId, phaseIndex, branch, worktreePath, baseCommit };
}

/**
 * Get the diff of the staging worktree vs the workspace branch point.
 * Runs `git diff HEAD` from inside the worktree so uncommitted changes
 * from the agent are included (via add -N intent-to-add).
 */
export async function getStagingDiff(session: StagingSession, git: GitRunner = defaultGit): Promise<DiffFile[]> {
  const cwd = session.worktreePath;
  const pathspec = ["--", ".", ":(exclude)node_modules", ":(exclude)dist", ":(exclude).next", ":(exclude).cache", ":(exclude).git"];
  await git(cwd, ["add", "-N", ...pathspec]);
  const base = session.baseCommit || "HEAD";
  const { stdout: numstat } = await git(cwd, ["diff", base, "--numstat", ...pathspec]);
  const { stdout: full } = await git(cwd, ["diff", base, ...pathspec]);
  await git(cwd, ["reset", "-q"]);
  const diffByPath = splitUnifiedDiff(full);
  const files: DiffFile[] = [];
  for (const line of numstat.split(/\r?\n/).filter(Boolean)) {
    const cols = line.split("\t");
    const adds = cols[0];
    const dels = cols[1];
    const path = cols.slice(2).join("\t");
    if (!path) continue;
    const binary = adds === "-" || dels === "-";
    files.push({
      path,
      adds: binary ? 0 : Number(adds) || 0,
      dels: binary ? 0 : Number(dels) || 0,
      diff: binary ? "" : (diffByPath.get(path) ?? ""),
      binary,
    });
    if (files.length >= 500) break;
  }
  return files;
}

// Local copy of git.ts#splitUnifiedDiff — kept private there. Single-purpose
// parser for `git diff` output keyed by the b/ path.
function splitUnifiedDiff(full: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!full || !full.trim()) return map;
  const parts = full.split(/\r?\n(?=diff --git )/);
  for (const part of parts) {
    const header = part.startsWith("diff --git ") ? part : `diff --git ${part}`;
    const first = header.split(/\r?\n/, 1)[0];
    let path = "";
    const bm = first.match(/ b\/(.+)$/);
    if (bm) path = bm[1].trim();
    else {
      const pp = header.match(/^\+\+\+ b\/(.+)$/m);
      if (pp) path = pp[1].trim();
    }
    if (path) map.set(path, header);
  }
  return map;
}

// Avoid "execFile is unused" — kept for future direct-spawn helpers.
void execFile;
