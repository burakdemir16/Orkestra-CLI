import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linuxFolderPicker } from "./folder-picker";

describe("linuxFolderPicker", () => {
  it("returns null when no picker binary is found", async () => {
    const probe = () => null;
    const p = linuxFolderPicker(probe, async () => "");
    assert.equal(p.available(), false);
    assert.equal(await p.pick(), null);
  });

  it("uses zenity first when present", async () => {
    const probeCalls: string[] = [];
    const probe = (bin: string) => {
      probeCalls.push(bin);
      return bin === "zenity" ? "/usr/bin/zenity" : null;
    };
    const spawnCalls: Array<[string, string[]]> = [];
    const spawnFn = async (bin: string, args: string[]) => {
      spawnCalls.push([bin, args]);
      return "/home/user/projects\n";
    };
    const p = linuxFolderPicker(probe, spawnFn);
    assert.equal(p.available(), true);
    assert.equal(await p.pick(), "/home/user/projects");
    assert.deepEqual(probeCalls.slice(0, 1), ["zenity"]);
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0][0], "zenity");
    assert.deepEqual(spawnCalls[0][1], ["--file-selection", "--directory", "--title=Orkestra: proje klasoru sec"]);
  });

  it("falls back to kdialog when zenity is missing", async () => {
    const probe = (bin: string) => (bin === "kdialog" ? "/usr/bin/kdialog" : null);
    const spawnCalls: string[] = [];
    const spawnFn = async (bin: string) => {
      spawnCalls.push(bin);
      return "/home/user/projects";
    };
    const p = linuxFolderPicker(probe, spawnFn);
    assert.equal(p.available(), true);
    assert.equal(await p.pick(), "/home/user/projects");
    assert.deepEqual(spawnCalls, ["kdialog"]);
  });

  it("returns null when user cancels (empty stdout)", async () => {
    const probe = (bin: string) => (bin === "zenity" ? "/usr/bin/zenity" : null);
    const p = linuxFolderPicker(probe, async () => "");
    assert.equal(await p.pick(), null);
  });

  it("falls through to kdialog when zenity fails to spawn", async () => {
    const probe = () => "/usr/bin/bin";
    const spawnCalls: string[] = [];
    const spawnFn = async (bin: string) => {
      spawnCalls.push(bin);
      if (bin === "zenity") throw new Error("no display");
      return "/from/kdialog";
    };
    const p = linuxFolderPicker(probe, spawnFn);
    assert.equal(await p.pick(), "/from/kdialog");
    assert.deepEqual(spawnCalls, ["zenity", "kdialog"]);
  });
});
