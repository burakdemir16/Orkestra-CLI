import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatus } from "../../../packages/shared/types";

const exec = promisify(execFile);

const blockedPatterns = [
  /^\.env($|\.)/i,
  /(^|[\\/])\.env($|\.)/i,
  /token/i,
  /secret/i,
  /credential/i,
  /private[-_]?key/i
];

export class GitService {
  constructor(private cwd: string) {}

  async status(): Promise<GitStatus> {
    const branch = await this.git(["branch", "--show-current"]).then((v) => v.trim()).catch(() => "unknown");
    const remote = await this.git(["remote"]).then((v) => v.trim()).catch(() => "");
    const porcelain = await this.git(["status", "--porcelain"]).catch(() => "");
    const diffStat = await this.git(["diff", "--stat"]).catch(() => "");

    return {
      branch,
      hasRemote: remote.length > 0,
      files: porcelain
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const status = line.slice(0, 2).trim();
          const path = line.slice(3).trim();
          const reason = blockedReason(path);
          return {
            path,
            status,
            blocked: Boolean(reason),
            reason
          };
        }),
      diffStat
    };
  }

  async createBranch(branch: string) {
    await this.git(["checkout", "-b", branch]);
  }

  async commit(files: string[], message: string) {
    const safeFiles = files.filter((file) => !blockedReason(file));
    if (safeFiles.length === 0) throw new Error("No safe files selected for commit.");
    await this.git(["add", "--", ...safeFiles]);
    await this.git(["commit", "-m", message]);
  }

  async push(branch: string) {
    await this.git(["push", "-u", "origin", branch]);
  }

  async createDraftPr(title: string, body: string) {
    return this.run("gh", ["pr", "create", "--draft", "--title", title, "--body", body]);
  }

  private async git(args: string[]) {
    return this.run("git", args);
  }

  private async run(command: string, args: string[]) {
    const { stdout, stderr } = await exec(command, args, {
      cwd: this.cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10
    });
    return stdout || stderr;
  }
}

function blockedReason(path: string) {
  if (blockedPatterns.some((pattern) => pattern.test(path))) {
    return "Looks like a secret or environment file.";
  }
  return undefined;
}
