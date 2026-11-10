/**
 * A real Stash to develop Stash TV against, seeded with mock-stash's fixtures (the same data the tests use):
 *
 *   yarn stash:dev [version] [--port <port>] [--with-plugin] [--reset | --fresh | --stop]
 *
 * - `version`: develop, latest-release (the default) or previous-release (see packages/stash-ui/stash-versions.json)
 * - `--port`: where it listens (default 9999)
 * - `--with-plugin`: installs the built plugin (packages/tv-plugin/dist, so `yarn build` first), when first started
 * - `--reset`: puts its data back as it was just after seeding
 * - `--fresh`: deletes it and its data, and starts and seeds it again
 * - `--stop`: stops it (`yarn stash:dev` starts it again, as it was)
 *
 * Its data is kept in packages/mock-stash/.local/stash-dev/<version>/ between runs. Run in Docker directly (not with
 * testcontainers, which removes its containers when the process ends).
 *
 * @see docs/testing-mock-stash.md § "A seeded Stash to develop against"
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEDIA_DIR, MEDIA_SPECS } from "../src/fixtures";
import { ensureMediaFixtures } from "../src/generate-media";
import { scanAndWait, setupStash, waitForStashReady } from "../src/real-stash";
import { seedRealStash } from "../src/seed-real-stash";
import { STASH_VERSIONS, stashVersionDetails, type StashVersion } from "../src/stash-versions";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIST = path.resolve(here, "../../tv-plugin/dist");

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const version = (args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--port") ?? "latest-release") as StashVersion;
if (!STASH_VERSIONS.includes(version)) {
  console.error(`Unknown Stash version "${version}": expected one of ${STASH_VERSIONS.join(", ")}`);
  process.exit(2);
}
const port = Number(option("port") ?? 9999);

const container = `stash-tv-dev-${version}`;
const dataDir = path.resolve(here, "../.local/stash-dev", version);
const configDir = path.join(dataDir, "config");
const image = stashVersionDetails(version).image;
const url = `http://127.0.0.1:${port}`;
const stash = { graphqlUrl: `${url}/graphql` };

function docker(...dockerArgs: string[]): string {
  return execFileSync("docker", dockerArgs, { encoding: "utf-8" }).trim();
}

function containerState(): "running" | "stopped" | "missing" {
  try {
    return docker("inspect", "--format", "{{.State.Running}}", container) === "true" ? "running" : "stopped";
  } catch {
    return "missing";
  }
}

/** Copies a file in its data, with the Stash image's own cp, as the files are the container's (root's, on Linux) */
function copyData(from: string, to: string) {
  docker("run", "--rm", "-v", `${configDir}:/root/.stash`, "--entrypoint", "cp", image, `/root/.stash/${from}`, `/root/.stash/${to}`);
}

function removeData(...files: string[]) {
  docker("run", "--rm", "-v", `${configDir}:/root/.stash`, "--entrypoint", "rm", image, "-f", ...files.map((file) => `/root/.stash/${file}`));
}

async function create() {
  ensureMediaFixtures();
  const mediaDir = path.join(dataDir, "media");
  mkdirSync(mediaDir, { recursive: true });
  mkdirSync(path.join(configDir, "plugins"), { recursive: true });
  for (const spec of MEDIA_SPECS) {
    cpSync(path.join(MEDIA_DIR, `${spec.name}${spec.ext}`), path.join(mediaDir, `${spec.name}${spec.ext}`));
  }
  const pluginMount: string[] = [];
  if (flag("with-plugin")) {
    if (!existsSync(PLUGIN_DIST)) throw new Error(`The plugin isn't built (no ${PLUGIN_DIST}): run \`yarn build\` first`);
    pluginMount.push("-v", `${PLUGIN_DIST}:/root/.stash/plugins/stash-tv:ro`);
  }
  console.log(`Starting Stash ${version} (${image})...`);
  docker(
    "run", "-d", "--name", container, "-p", `${port}:9999`, "-e", "STASH_HOST=0.0.0.0",
    "-v", `${configDir}:/root/.stash`, "-v", `${mediaDir}:/media`, ...pluginMount, image,
  );
  await waitForStashReady(stash);
  console.log("Setting it up, scanning the media and seeding it with mock-stash's fixtures...");
  await setupStash(stash);
  await scanAndWait(stash);
  await seedRealStash(stash);
  // Kept for --reset, taken stopped so the database is complete
  docker("stop", container);
  copyData("go.sqlite", "go.sqlite.seeded");
  docker("start", container);
  await waitForStashReady(stash);
}

async function main() {
  const state = containerState();
  if (flag("stop")) {
    if (state === "running") docker("stop", container);
    console.log(`Stopped Stash ${version}`);
    return;
  }
  if (flag("fresh")) {
    if (state !== "missing") docker("rm", "-f", container);
    if (existsSync(dataDir)) {
      removeData("go.sqlite", "go.sqlite.seeded", "go.sqlite-wal", "go.sqlite-shm", "config.yml");
      rmSync(dataDir, { recursive: true, force: true });
    }
    await create();
  } else if (flag("reset")) {
    if (state === "missing") throw new Error(`There's no Stash ${version} to reset: run \`yarn stash:dev ${version}\``);
    if (state === "running") docker("stop", container);
    removeData("go.sqlite-wal", "go.sqlite-shm");
    copyData("go.sqlite.seeded", "go.sqlite");
    docker("start", container);
    await waitForStashReady(stash);
  } else if (state === "missing") {
    await create();
  } else if (state === "stopped") {
    docker("start", container);
    await waitForStashReady(stash);
  }
  console.log(`\nStash ${version} is running at ${url}`);
  console.log(`Develop against it with STASH_ADDRESS=${url} in packages/tv-ui/.env`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
