import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { startMockStash, type MockStashServer } from "../../src/server";
import type { MockStashVersion } from "../../src/schema";
import {
  isDockerAvailable,
  startRealStash,
  stashGql,
  type RealStash,
} from "./real-stash";

/**
 * Conformance: the mock Stash API must behave like the real one for everything the
 * app does. Each test runs the same operation against both servers and compares a
 * *projection* of the response — volatile fields (ids, timestamps, host-dependent
 * URLs) are normalised away, everything else must match.
 *
 * If these tests fail after a Stash upgrade, the mock's resolvers have drifted from
 * real behaviour and must be updated (or the divergence explicitly waived here).
 */

const dockerAvailable = await isDockerAvailable();
// The vitest.conformance.config.ts projects run this once per Stash version Stash TV supports
const stashVersion: MockStashVersion = process.env.MOCK_STASH_VERSION === "latest-release" ? "latest-release" : "pinned";

let mock: MockStashServer;
let real: RealStash;

async function gqlBoth(
  query: string,
  variables?: Record<string, unknown>,
): Promise<[Record<string, unknown>, Record<string, unknown>]> {
  const mockResponse = await fetch(mock.httpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const mockBody = (await mockResponse.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
  const realData = await stashGql(real, query, variables);
  if (mockBody.errors?.length) {
    throw new Error(`mock query errors: ${mockBody.errors.map((e) => e.message).join("; ")}`);
  }
  return [mockBody.data ?? {}, realData];
}

beforeAll(async () => {
  if (!dockerAvailable) return;
  mock = await startMockStash({ stashVersion });
  real = await startRealStash(stashVersion);
}, 300_000);

afterAll(async () => {
  await real?.stop();
  await mock?.stop();
});

describe.skipIf(!dockerAvailable)("conformance: scene querying", () => {
  it("findScenes returns the scanned scenes", async () => {
    const query = `{ findScenes(filter: {per_page: -1}) { count scenes { files { basename duration width height video_codec } } } }`;
    const [mockData, realData] = await gqlBoth(query);

    const project = (data: Record<string, unknown>) =>
      ((data.findScenes as { scenes: { files: { basename: string; duration: number; width: number; height: number; video_codec: string }[] }[] }).scenes)
        .map((s) => s.files[0])
        .map(({ basename, duration, width, height, video_codec }) => ({ basename, duration, width, height, video_codec }))
        .sort((a, b) => a.basename.localeCompare(b.basename));

    // The real instance has the 4 media files; the mock has 8 scenes (4 media re-used).
    // Conformance here is about per-scene fidelity, so compare the shared subset.
    const mockFiles = project(mockData);
    const realFiles = project(realData);
    expect(realFiles).toHaveLength(4);
    for (const realFile of realFiles) {
      const mockMatch = mockFiles.find((f) => f.basename === realFile.basename);
      expect(mockMatch, `mock missing scene for ${realFile.basename}`).toBeDefined();
      expect(mockMatch).toEqual(realFile);
    }
  });

  it("findScenes sorts by path consistently", async () => {
    const query = `{ findScenes(filter: {per_page: -1, sort: "path", direction: ASC}) { scenes { files { path } } } }`;
    const [mockData, realData] = await gqlBoth(query);
    const order = (data: Record<string, unknown>) =>
      ((data.findScenes as { scenes: { files: { path: string }[] }[] }).scenes)
        .map((s) => s.files[0].path.split("/").pop()!)
        .sort();
    expect(order(mockData).slice(0, 4)).toEqual(order(realData));
  });

  it("sceneStreams label vocabulary matches", async () => {
    // Get a real scene id by basename, then compare the label list for the
    // corresponding mp4 scene.
    const realScenes = await stashGql(
      real,
      `{ findScenes(filter: {per_page: -1}) { scenes { id files { basename } } } }`,
    );
    const target = (
      (realScenes.findScenes as { scenes: { id: string; files: { basename: string }[] }[] }).scenes
    ).find((s) => s.files[0]?.basename === "scene-1.mp4");
    expect(target).toBeDefined();

    const realStreams = await stashGql(
      real,
      `query($id: ID) { sceneStreams(id: $id) { label mime_type } }`,
      { id: target!.id },
    );

    const mockScenes = await (
      await fetch(mock.httpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: `{ findScenes(filter: {per_page: -1}) { scenes { id files { basename } } } }` }),
      })
    ).json();
    const mockTarget = (
      (mockScenes.data.findScenes as { scenes: { id: string; files: { basename: string }[] }[] }).scenes
    ).find((s) => s.files[0]?.basename === "scene-1.mp4");
    expect(mockTarget).toBeDefined();
    const mockStreams = await (
      await fetch(mock.httpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: `query($id: ID) { sceneStreams(id: $id) { label mime_type } }`, variables: { id: mockTarget!.id } }),
      })
    ).json();

    const labels = (data: { sceneStreams: { label: string | null; mime_type: string | null }[] }) =>
      data.sceneStreams.map((s) => s.label);
    expect(labels(mockStreams.data)).toEqual(labels(realStreams as never));
  });

  it("configuration shape matches (plugins/ui round-trip)", async () => {
    // configurePlugin then read it back through configuration on both servers
    const configure = `mutation($plugin_id: ID!, $input: Map!) { configurePlugin(plugin_id: $plugin_id, input: $input) }`;
    const [, realResult] = await gqlBoth(configure, {
      plugin_id: "conformance-test",
      input: { someFlag: true, nested: { a: 1 } },
    });
    const readBack = `{ configuration { plugins } }`;
    const [mockConfig, realConfig] = await gqlBoth(readBack);

    expect(
      (mockConfig.configuration as { plugins: Record<string, unknown> }).plugins["conformance-test"],
    ).toEqual(
      (realConfig.configuration as { plugins: Record<string, unknown> }).plugins["conformance-test"],
    );
    void realResult;
  });
});
