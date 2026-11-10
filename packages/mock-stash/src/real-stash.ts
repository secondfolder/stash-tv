import path from "node:path";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { MEDIA_DIR, MEDIA_SPECS } from "./fixtures";
import { stashVersionDetails, type StashVersion } from "./stash-versions";

/**
 * A real Stash in Docker, of any version Stash TV is tested against, for the tests that check against one: mock-stash's
 * conformance tests, and tv-plugin's tests of the plugin in Stash. Each version's image is in
 * `packages/stash-ui/stash-versions.json`. Stash only publishes develop as the moving `development` tag, so develop's
 * is pinned by digest: the image pushed right after its commit.
 *
 * Imported as `mock-stash/src/real-stash` rather than from the package's entry, which the app's tests import too, so
 * they don't load testcontainers.
 */
const STASH_PORT = 9999;

export interface RealStash {
  /** The Stash version running */
  version: StashVersion;
  url: string;
  graphqlUrl: string;
  container: StartedTestContainer;
  stop(): Promise<void>;
}

export interface StartRealStashOptions {
  /** Plugins to install, by id: each directory is mounted as the plugin's folder in Stash's plugins directory */
  plugins?: Record<string, string>;
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
 * Whether tests needing a real Stash can run. Without Docker they skip themselves, unless `REQUIRE_DOCKER` is set (as
 * CI does), when this throws instead, so a broken Docker set-up can't pass by skipping every test.
 */
export async function canRunRealStash(): Promise<boolean> {
  const available = await isDockerAvailable();
  if (!available && process.env.REQUIRE_DOCKER) {
    throw new Error("REQUIRE_DOCKER is set, but Docker isn't available to start a real Stash");
  }
  return available;
}

/**
 * Boots a real Stash instance of the given version with the same media fixtures the mock serves (main files only — a
 * real scan would turn preview clips into scenes), then runs setup + a metadata scan so scenes exist.
 */
export async function startRealStash(version: StashVersion, options: StartRealStashOptions = {}): Promise<RealStash> {
  const tempDirs: string[] = [];
  const makeTempDir = (prefix: string) => {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  };
  // Only the main media files — previews/screenshots must not be scanned as scenes.
  const mediaDir = makeTempDir("stash-media-");
  for (const spec of MEDIA_SPECS) {
    cpSync(path.join(MEDIA_DIR, `${spec.name}${spec.ext}`), path.join(mediaDir, `${spec.name}${spec.ext}`));
  }
  const configDir = makeTempDir("stash-config-");
  mkdirSync(path.join(configDir, "generated"), { recursive: true });
  mkdirSync(path.join(configDir, "cache"), { recursive: true });
  mkdirSync(path.join(configDir, "plugins"), { recursive: true });

  const container = await new GenericContainer(stashVersionDetails(version).image)
    .withExposedPorts(STASH_PORT)
    .withEnvironment({
      // No auth; the app cannot send cookies cross-origin from the dev server.
      STASH_HOST: "0.0.0.0",
    })
    .withBindMounts([
      { source: configDir, target: "/root/.stash" },
      { source: mediaDir, target: "/media" },
      ...Object.entries(options.plugins ?? {}).map(([id, dir]) => ({
        source: path.resolve(dir),
        target: `/root/.stash/plugins/${id}`,
        mode: "ro" as const,
      })),
    ])
    .withWaitStrategy(Wait.forLogMessage(/stash is listening/, 1).withStartupTimeout(120_000))
    .start();

  const url = `http://127.0.0.1:${container.getMappedPort(STASH_PORT)}`;

  const realStash: RealStash = {
    version,
    url,
    graphqlUrl: `${url}/graphql`,
    container,
    stop: async () => {
      await container.stop({ remove: true, timeout: 10_000 });
      for (const dir of tempDirs) {
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    },
  };

  await waitForStashReady(realStash);
  await setupStash(realStash);
  await scanAndWait(realStash);
  return realStash;
}

async function gql(
  stash: Pick<RealStash, "graphqlUrl">,
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

export async function waitForStashReady(stash: Pick<RealStash, "graphqlUrl">) {
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

export async function setupStash(stash: Pick<RealStash, "graphqlUrl">) {
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

export async function scanAndWait(stash: Pick<RealStash, "graphqlUrl">) {
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

export { gql as stashGql };
