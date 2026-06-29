import { execFile, execFileSync } from "node:child_process";

// Cross-platform native folder picker.
// - Windows: handled inline in index.ts via PowerShell IFileOpenDialog (existing).
// - macOS: TODO — osascript ("choose folder"). Not implemented here until a macOS
//   developer can validate it; see follow-up issue.
// - Linux: tries zenity, then kdialog. Returns null if neither is installed.

export type PickerProbe = (bin: string) => string | null;

export type PickerSpawn = (bin: string, args: string[]) => Promise<string>;

export type FolderPicker = {
  /** Resolve a native folder picker for the current platform. Returns the selected path, or null if cancelled. */
  pick(): Promise<string | null>;
  /** True when this implementation has a working picker on the current host. */
  available(): boolean;
};

const DEFAULT_PROBE: PickerProbe = (bin) => {
  try {
    const out = execFileSync("which", [bin], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out || null;
  } catch {
    return null;
  }
};

const DEFAULT_SPAWN: PickerSpawn = (bin, args) =>
  new Promise((resolveP, rejectP) => {
    execFile(bin, args, { encoding: "utf8" }, (err, stdout) => {
      if (err) return rejectP(err);
      resolveP(stdout);
    });
  });

/**
 * Linux folder picker: zenity (GNOME) first, kdialog (KDE) fallback.
 * Both print the chosen path on stdout; an empty stdout means the user cancelled.
 */
export function linuxFolderPicker(
  probe: PickerProbe = DEFAULT_PROBE,
  spawnFn: PickerSpawn = DEFAULT_SPAWN
): FolderPicker {
  // (bin, args): each candidate must print a single line (the chosen folder) on stdout.
  const candidates: ReadonlyArray<readonly [string, string[]]> = [
    ["zenity", ["--file-selection", "--directory", "--title=Orkestra: proje klasoru sec"]],
    ["kdialog", ["--getexistingdirectory", "."]],
  ];
  return {
    available() {
      return candidates.some(([bin]) => probe(bin) !== null);
    },
    async pick() {
      for (const [bin, args] of candidates) {
        if (probe(bin) === null) continue;
        try {
          const out = (await spawnFn(bin, args as string[])).trim();
          return out || null; // empty stdout = user cancelled
        } catch {
          // try the next candidate
        }
      }
      return null;
    },
  };
}
