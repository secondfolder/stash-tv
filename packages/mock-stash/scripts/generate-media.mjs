/**
 * Generates the deterministic media fixtures used by the mock Stash server (and by the
 * real-Stash conformance containers). Uses ffmpeg's lavfi `testsrc2` generator, so output
 * is identical every time it runs.
 *
 * Usage: yarn --cwd packages/mock-stash generate-media
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../src/media");
mkdirSync(outDir, { recursive: true });

const SPECS = [
  { name: "scene-1", duration: 12, size: "320x180", prevSize: "160x90", kind: "mp4" },
  { name: "scene-2", duration: 12, size: "320x180", prevSize: "160x90", kind: "webm" },
  { name: "scene-3", duration: 12, size: "180x320", prevSize: "90x160", kind: "mp4" },
  { name: "scene-4", duration: 10, size: "240x240", prevSize: "120x120", kind: "mp4" },
];

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

for (const spec of SPECS) {
  const input = `testsrc2=duration=${spec.duration}:size=${spec.size}:rate=24`;

  if (spec.kind === "mp4") {
    ffmpeg([
      "-f", "lavfi", "-i", input,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "33", "-pix_fmt", "yuv420p",
      path.join(outDir, `${spec.name}.mp4`),
    ]);
  } else {
    ffmpeg([
      "-f", "lavfi", "-i", input,
      "-c:v", "libvpx", "-crf", "32", "-b:v", "250k",
      path.join(outDir, `${spec.name}.webm`),
    ]);
  }

  // Screenshot (first frame)
  ffmpeg([
    "-f", "lavfi", "-i", `testsrc2=duration=0.05:size=${spec.size}:rate=24`,
    "-frames:v", "1", "-q:v", "5",
    path.join(outDir, `${spec.name}.jpg`),
  ]);

  // Preview clip (webm, like Stash generates)
  ffmpeg([
    "-f", "lavfi", "-i", `testsrc2=duration=2:size=${spec.prevSize}:rate=12`,
    "-c:v", "libvpx", "-crf", "30", "-b:v", "150k",
    path.join(outDir, `${spec.name}-preview.webm`),
  ]);

  console.log(`generated ${spec.name} (${spec.kind})`);
}

console.log(`media written to ${outDir}`);
