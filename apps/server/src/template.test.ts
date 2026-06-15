import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpolateArgs } from "./template";

describe("interpolateArgs", () => {
  it("fills prompt and workspace placeholders", () => {
    assert.deepEqual(
      interpolateArgs(["-p", "{prompt}", "--cwd", "{workspace}"], {
        prompt: "site yap",
        workspace: "C:/tmp/run",
        transcript: "",
        role: "builder"
      }),
      ["-p", "site yap", "--cwd", "C:/tmp/run"]
    );
  });
});
