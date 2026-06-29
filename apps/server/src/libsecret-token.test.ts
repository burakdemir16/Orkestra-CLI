import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { libsecretStore, LIBSECRET_PREFIX } from "./libsecret-token";

const tmp = mkdtempSync(join(tmpdir(), "orkestra-libsecret-"));

describe("libsecretStore", () => {
  it("reports unavailable when secret-tool is not on PATH", () => {
    const s = libsecretStore(join(tmp, "missing.dat"), () => null, async () => ({ stdout: "", stderr: "", code: 0 }));
    assert.equal(s.available(), false);
  });

  it("set: stores in keyring via secret-tool and writes a marker file", async () => {
    const file = join(tmp, "token-set.dat");
    const calls: Array<{ bin: string; args: string[]; stdin?: string }> = [];
    const probe = (bin: string) => (bin === "secret-tool" ? "/usr/bin/secret-tool" : null);
    const run = async (bin: string, args: string[], stdin?: string) => {
      calls.push({ bin, args, stdin });
      return { stdout: "", stderr: "", code: 0 };
    };
    const s = libsecretStore(file, probe, run);
    assert.equal(s.available(), true);
    await s.set("ghp_secretvalue");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].bin, "secret-tool");
    assert.deepEqual(calls[0].args, [
      "store",
      "--label=orkestra",
      "service",
      "orkestra",
      "account",
      "github",
    ]);
    assert.equal(calls[0].stdin, "ghp_secretvalue");
    assert.equal(readFileSync(file, "utf8"), LIBSECRET_PREFIX);
  });

  it("set: throws when secret-tool exits non-zero", async () => {
    const file = join(tmp, "token-fail.dat");
    const probe = () => "/usr/bin/secret-tool";
    const run = async () => ({ stdout: "", stderr: "keyring locked", code: 1 });
    const s = libsecretStore(file, probe, run);
    await assert.rejects(() => s.set("x"), /keyring locked/);
  });

  it("get: returns the keyring entry", async () => {
    const probe = () => "/usr/bin/secret-tool";
    const run = async (bin: string, args: string[]) => {
      assert.equal(bin, "secret-tool");
      assert.deepEqual(args, ["lookup", "service", "orkestra", "account", "github"]);
      return { stdout: "ghp_secretvalue\n", stderr: "", code: 0 };
    };
    const s = libsecretStore(join(tmp, "x.dat"), probe, run);
    assert.equal(await s.get(), "ghp_secretvalue");
  });

  it("get: returns null on non-zero exit (keyring entry missing)", async () => {
    const probe = () => "/usr/bin/secret-tool";
    const run = async () => ({ stdout: "", stderr: "No such secret", code: 1 });
    const s = libsecretStore(join(tmp, "x.dat"), probe, run);
    assert.equal(await s.get(), null);
  });

  it("get: returns null when secret-tool is not installed", async () => {
    const s = libsecretStore(join(tmp, "x.dat"), () => null, async () => ({ stdout: "", stderr: "", code: 0 }));
    assert.equal(await s.get(), null);
  });

  it("clear: invokes secret-tool clear when available", async () => {
    const calls: string[][] = [];
    const probe = () => "/usr/bin/secret-tool";
    const run = async (_bin: string, args: string[]) => {
      calls.push(args);
      return { stdout: "", stderr: "", code: 0 };
    };
    const s = libsecretStore(join(tmp, "x.dat"), probe, run);
    await s.clear();
    assert.deepEqual(calls, [["clear", "service", "orkestra", "account", "github"]]);
  });

  it("clear: no-op when secret-tool is not installed", async () => {
    let called = false;
    const s = libsecretStore(
      join(tmp, "x.dat"),
      () => null,
      async () => {
        called = true;
        return { stdout: "", stderr: "", code: 0 };
      }
    );
    await s.clear();
    assert.equal(called, false);
  });
});

process.on("exit", () => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});
