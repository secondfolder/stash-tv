import path from "node:path";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { MEDIA_SPECS } from "../../src/fixtures";
import type { MockStashVersion } from "../../src/schema";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MEDIA_DIR = path.resolve(here, "../../src/media");

/**
 * The real Stash for each version Stash TV supports (see docs/stash-compatibility.md):
 * - `pinned` matches the stash submodule in stash-ui (develop at e7d33c9b, v0.31.1-175-ge7d33c9b). Stash only
 *   publishes develop as the moving `development` tag, so it's pinned by digest: the image pushed right after that
 *   commit.
 * - `latest-stable-release` matches `STASH_RELEASE_VERSION` in stash-ui's setup.sh.
 */
export const STASH_IMAGES: Record<MockStashVersion, string> = {
  pinned: "stashapp/stash:development@sha256:1d9758bad8df69f27ab7110de12191e5b1cf2548343076be6e895746824f3bf5",
  "latest-stable-release": "stashapp/stash:v0.31.1",
};
const STASH_PORT = 9999;

export interface RealStash {
  url: string;
  graphqlUrl: string;
  container: StartedTestContainer;
  stop(): Promise<void>;
}

let tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Boots a real Stash instance seeded with the same committed media fixtures the mock
 * serves (main files only — a real scan would turn preview clips into scenes), then
 * runs setup + a metadata scan so scenes exist.
 */
export async function startRealStash(version: MockStashVersion): Promise<RealStash> {
  // Only the main media files — previews/screenshots must not be scanned as scenes.
  const mediaDir = makeTempDir("stash-media-");
  for (const spec of MEDIA_SPECS) {
    cpSync(path.join(MEDIA_DIR, `${spec.name}${spec.ext}`), path.join(mediaDir, `${spec.name}${spec.ext}`));
  }
  const configDir = makeTempDir("stash-config-");
  mkdirSync(path.join(configDir, "generated"), { recursive: true });
  mkdirSync(path.join(configDir, "cache"), { recursive: true });

  const container = await new GenericContainer(STASH_IMAGES[version])
    .withExposedPorts(STASH_PORT)
    .withEnvironment({
      // No auth; the app cannot send cookies cross-origin from the dev server.
      STASH_HOST: "0.0.0.0",
    })
    .withBindMounts([
      { source: configDir, target: "/root/.stash" },
      { source: mediaDir, target: "/media" },
    ])
    .withWaitStrategy(Wait.forLogMessage(/stash is listening/, 1).withStartupTimeout(120_000))
    .start();

  const url = `http://127.0.0.1:${container.getMappedPort(STASH_PORT)}`;

  const realStash: RealStash = {
    url,
    graphqlUrl: `${url}/graphql`,
    container,
    stop: async () => {
      await container.stop({ remove: true, timeout: 10_000 });
      for (const dir of tempDirs) {
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
      tempDirs = [];
    },
  };

  await waitForStashReady(realStash);
  await setupStash(realStash);
  await scanAndWait(realStash);
  return realStash;
}

async function gql(
  stash: RealStash,
  query: string,
  variables?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(stash.graphqlUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`stash query failed (${response.status}): ${await response.text()}`);
  }
  const body = (await response.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
  if (body.errors?.length) {
    throw new Error(`stash query errors: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  return body.data ?? {};
}

async function waitForStashReady(stash: RealStash) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await gql(stash, `{ systemStatus { status } }`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("stash did not become ready within 60s");
}

async function setupStash(stash: RealStash) {
  const status = await gql(stash, `{ systemStatus { status } }`);
  if ((status.systemStatus as { status: string }).status !== "SETUP") return;
  await gql(
    stash,
    `mutation { setup(input: {
      configLocation: "/root/.stash/config.yml"
      stashes: [{ path: "/media", excludeVideo: false, excludeImage: true }]
      databaseFile: "/root/.stash/go.sqlite"
      generatedLocation: "/root/.stash/generated"
      cacheLocation: "/root/.stash/cache"
      storeBlobsInDatabase: true
      blobsLocation: "/root/.stash/blobs"
    }) }`,
  );
}

async function scanAndWait(stash: RealStash) {
  const data = await gql(
    stash,
    `mutation { metadataScan(input: { rescan: false, scanGenerateCovers: false, scanGeneratePreviews: false, scanGenerateImagePreviews: false, scanGenerateSprites: false, scanGeneratePhashes: false, scanGenerateThumbnails: false, scanGenerateClipPreviews: false }) }`,
  );
  const jobId = data.metadataScan as string;

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const status = await gql(
      stash,
      `query($id: FindJobInput!) { findJob(input: $id) { status } }`,
      { id: { id: jobId } },
    );
    const jobStatus = (status.findJob as { status: string } | null)?.status;
    if (jobStatus === "FINISHED") return;
    if (jobStatus === "FAILED" || jobStatus === "CANCELLED") {
      throw new Error(`stash scan ${jobStatus}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("stash scan did not finish within 240s");
}

/** Maps real stash scene IDs (numeric) to the fixture scene keys via file basenames. */
export async function buildSceneIdMap(stash: RealStash): Promise<Map<string, string>> {
  const data = await gql(
    stash,
    `{ findScenes(filter: {per_page: -1}) { scenes { id files { basename } } } }`,
  );
  const scenes = (data.findScenes as { scenes: { id: string; files: { basename: string }[] }[] }).scenes;
  const map = new Map<string, string>();
  for (const scene of scenes) {
    const basename = scene.files[0]?.basename ?? "";
    // scene-1.mp4..scene-8 (media is reused for scenes 5-8, so multiple scenes share a basename)
    const match = basename.match(/^scene-(\d)\.(mp4|webm)$/);
    if (match) {
      map.set(scene.id, `scene-${match[1]}`);
    }
  }
  return map;
}

/** Media files present in the fixtures dir — the scan should find one scene per file. */
export function expectedScannedSceneCount(): number {
  return MEDIA_SPECS.length;
}

export { gql as stashGql };
