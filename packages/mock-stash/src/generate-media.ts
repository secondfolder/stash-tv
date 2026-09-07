import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { MEDIA_DIR, MEDIA_SPECS, type MediaSpec } from "./fixtures";

/**
 * Generates the deterministic media fixtures the mock server streams (and that seed the
 * real-Stash conformance containers). Uses ffmpeg's lavfi `testsrc2` generator, so output
 * is identical every time it runs — which is why the files are gitignored rather than
 * committed.
 *
 * The mock server calls `ensureMediaFixtures()` on start, so a fresh clone needs nothing
 * but ffmpeg on PATH. To force a rebuild: `yarn --cwd packages/mock-stash generate-media`.
 */

/** The files `generateMediaFixtures` produces for one spec, relative to `MEDIA_DIR`. */
function filesFor(spec: MediaSpec): string[] {
  return [`${spec.name}${spec.ext}`, `${spec.name}.jpg`, `${spec.name}-preview.webm`];
}

export function mediaFixturesExist(): boolean {
  return MEDIA_SPECS.every((spec) =>
    filesFor(spec).every((name) => existsSync(path.join(MEDIA_DIR, name))),
  );
}

/** Generates the fixtures only if any are missing. Safe (and near-free) to call on every boot. */
export function ensureMediaFixtures(): void {
  if (mediaFixturesExist()) return;
  console.log("[mock-stash] media fixtures missing — generating with ffmpeg...");
  generateMediaFixtures();
}

/**
 * (Re)generates every fixture. Encodes into a temp dir and moves the results into place,
 * so concurrently starting servers can never read a half-written file.
 */
export function generateMediaFixtures(): void {
  mkdirSync(MEDIA_DIR, { recursive: true });
  const stagingDir = mkdtempSync(path.join(MEDIA_DIR, ".staging-"));

  try {
    for (const spec of MEDIA_SPECS) {
      const source = `testsrc2=duration=${spec.duration}:size=${spec.width}x${spec.height}:rate=24`;

      if (spec.ext === ".mp4") {
        ffmpeg([
          "-f", "lavfi", "-i", source,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "33", "-pix_fmt", "yuv420p",
          path.join(stagingDir, `${spec.name}.mp4`),
        ]);
      } else {
        ffmpeg([
          "-f", "lavfi", "-i", source,
          "-c:v", "libvpx", "-crf", "32", "-b:v", "250k",
          path.join(stagingDir, `${spec.name}.webm`),
        ]);
      }

      // Screenshot (first frame)
      ffmpeg([
        "-f", "lavfi", "-i", `testsrc2=duration=0.05:size=${spec.width}x${spec.height}:rate=24`,
        "-frames:v", "1", "-q:v", "5",
        path.join(stagingDir, `${spec.name}.jpg`),
      ]);

      // Preview clip (webm at half size, like Stash generates)
      ffmpeg([
        "-f", "lavfi", "-i",
        `testsrc2=duration=2:size=${spec.width / 2}x${spec.height / 2}:rate=12`,
        "-c:v", "libvpx", "-crf", "30", "-b:v", "150k",
        path.join(stagingDir, `${spec.name}-preview.webm`),
      ]);

      for (const name of filesFor(spec)) {
        renameSync(path.join(stagingDir, name), path.join(MEDIA_DIR, name));
      }
      console.log(`[mock-stash] generated ${spec.name} (${spec.ext.slice(1)})`);
    }
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

function ffmpeg(args: string[]): void {
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "mock-stash needs ffmpeg on PATH to generate its media fixtures. Install it " +
          "(e.g. `brew install ffmpeg` / `apt install ffmpeg`) and retry.",
        { cause },
      );
    }
    throw cause;
  }
}
