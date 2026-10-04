import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { print, type DocumentNode } from "graphql";
import { createClient, type Client } from "graphql-ws";
import WebSocket from "ws";
import { MOCK_STASH_TENANT_COOKIE, MOCK_STASH_TENANT_HEADER, startMockStash, type MockStashServer } from "../src/server";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";

/** Raw query strings for exercising fields not exported as documents. */
const RAW_DOCS = {
  sceneStreams: `query SceneStreamsRoot($id: ID) {\n  sceneStreams(id: $id) {\n    url\n    label\n  }\n}`,
} as const;

function rawQuery(query: string, variables?: Record<string, unknown>) {
  return fetch(server.httpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
}

/**
 * Meta test: every GraphQL operation Stash TV actually sends must execute successfully
 * against the mock server, using the *real* generated documents. If a new operation is
 * added to the app without mock support, it fails here rather than in dozens of
 * downstream tests.
 */

let server: MockStashServer;
let wsClient: Client;

async function gql<T = Record<string, unknown>>(
  doc: DocumentNode,
  variables?: Record<string, unknown>,
): Promise<T> {
  const operationName = doc.definitions[0]?.kind === "OperationDefinition"
    ? doc.definitions[0].name?.value ?? "(anonymous)"
    : "(anonymous)";
  const response = await fetch(server.httpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: print(doc), variables }),
  });
  expect(response.ok).toBeTruthy();
  const body = (await response.json()) as { data?: T; errors?: unknown[] };
  expect(body.errors, `operation ${operationName} returned errors`).toBeUndefined();
  expect(body.data, `operation ${operationName} returned no data`).toBeDefined();
  return body.data!;
}

beforeAll(async () => {
  server = await startMockStash();
});

afterAll(async () => {
  await wsClient?.dispose?.();
  await server.stop();
});

describe("queries the app uses", () => {
  it("Configuration", async () => {
    const data = await gql< { configuration: { plugins: Record<string, unknown>; ui: Record<string, unknown>; interface: { menuItems: string[] } } }>(GQL.ConfigurationDocument);
    expect(data.configuration.plugins).toEqual({});
    expect(data.configuration.ui.defaultFilters).toBeDefined();
    expect(Array.isArray(data.configuration.interface.menuItems)).toBe(true);
  });

  it("FindFullScenes — page 1", async () => {
    const data = await gql<{ findScenes: { count: number; scenes: { id: string; title: string | null }[] } }>(
      GQL.FindFullScenesDocument,
      { filter: { q: "", page: 1, per_page: 5, sort: "date", direction: "DESC" } },
    );
    expect(data.findScenes.count).toBe(8);
    expect(data.findScenes.scenes).toHaveLength(5);
  });

  it("FindFullScenes — page 2", async () => {
    const data = await gql<{ findScenes: { scenes: { id: string }[] } }>(
      GQL.FindFullScenesDocument,
      { filter: { q: "", page: 2, per_page: 5, sort: "date", direction: "DESC" } },
    );
    expect(data.findScenes.scenes).toHaveLength(3);
  });

  it("FindFullScenes — orientation scene_filter", async () => {
    const data = await gql<{ findScenes: { count: number; scenes: { id: string }[] } }>(
      GQL.FindFullScenesDocument,
      {
        filter: { q: "", per_page: -1, sort: "date", direction: "DESC" },
        scene_filter: { orientation: { value: ["PORTRAIT", "SQUARE"] } },
      },
    );
    // scene-3 (portrait), scene-7 (portrait), scene-4/scene-8 (square)
    expect(data.findScenes.scenes.map((s) => s.id).sort()).toEqual(
      ["scene-3", "scene-4", "scene-7", "scene-8"].sort(),
    );
  });

  it("FindFullScenes — studios scene_filter, leaving out scenes without a studio", async () => {
    const data = await gql<{ findScenes: { scenes: { id: string }[] } }>(
      GQL.FindFullScenesDocument,
      {
        filter: { q: "", per_page: -1, sort: "date", direction: "DESC" },
        scene_filter: { studios: { value: ["studio-prism"], modifier: "INCLUDES", depth: -1 } },
      },
    );
    expect(data.findScenes.scenes.map((s) => s.id).sort()).toEqual(["scene-1", "scene-2"]);
  });

  it("FindFullScenes — studios scene_filter includes sub-studios' scenes", async () => {
    const { studios, scenes } = server.store;
    const scene3 = scenes.get("scene-3");
    const prism = studios.get("studio-prism");
    if (!scene3 || !prism) throw new Error("Fixtures changed");
    studios.set("studio-sub", { ...prism, id: "studio-sub", name: "Sub", parent_studio_id: "studio-prism" });
    scenes.set("scene-3", { ...scene3, studio_id: "studio-sub" });
    try {
      const data = await gql<{ findScenes: { scenes: { id: string }[] } }>(
        GQL.FindFullScenesDocument,
        {
          filter: { q: "", per_page: -1, sort: "date", direction: "DESC" },
          scene_filter: { studios: { value: ["studio-prism"], modifier: "INCLUDES", depth: -1 } },
        },
      );
      expect(data.findScenes.scenes.map((s) => s.id).sort()).toEqual(["scene-1", "scene-2", "scene-3"]);
    } finally {
      studios.delete("studio-sub");
      scenes.set("scene-3", scene3);
    }
  });

  it("FindTag / FindPerformer / FindStudio, with Stash's mark on a stand-in image", async () => {
    const tag = await gql<{ findTag: { name: string; image_path: string } }>(GQL.FindTagDocument, { id: "tag-alpha" });
    expect(tag.findTag.name).toBe("Alpha");
    expect(tag.findTag.image_path).toContain("default=true");
    const performer = await gql<{ findPerformer: { name: string; image_path: string } }>(
      GQL.FindPerformerDocument, { id: "performer-alice" },
    );
    expect(performer.findPerformer.name).toBe("Alice Amaze");
    expect(performer.findPerformer.image_path).toContain("default=true");
    const studio = await gql<{ findStudio: { name: string; image_path: string } }>(GQL.FindStudioDocument, { id: "studio-prism" });
    expect(studio.findStudio.name).toBe("Prism Pictures");
    expect(studio.findStudio.image_path).toContain("default=true");
  });

  it("FindSceneMarkersForTv", async () => {
    const data = await gql<{ findSceneMarkers: { count: number; scene_markers: { id: string; scene: { id: string } }[] } }>(
      GQL.FindSceneMarkersForTvDocument,
      { filter: { q: "", page: 1, per_page: 20, sort: "scene_id", direction: "ASC" } },
    );
    expect(data.findSceneMarkers.count).toBe(6);
    expect(data.findSceneMarkers.scene_markers.length).toBeGreaterThan(0);
    for (const marker of data.findSceneMarkers.scene_markers) {
      expect(marker.scene.id).toMatch(/^scene-\d$/);
    }
  });

  it("MarkerStrings lists every marker title in use, alphabetically", async () => {
    const data = await gql<{ markerStrings: { title: string; count: number }[] }>(GQL.MarkerStringsDocument, {});
    expect(data.markerStrings.map((entry) => entry.title)).toEqual([
      "Finale", "Highlight", "Intro", "Loop Point", "Opening", "Peak",
    ]);
    expect(data.markerStrings.every((entry) => entry.count === 1)).toBe(true);
  });

  it("MarkerStrings filters titles by a case-insensitive substring", async () => {
    const data = await gql<{ markerStrings: { title: string }[] }>(GQL.MarkerStringsDocument, { q: "in" });
    expect(data.markerStrings.map((entry) => entry.title)).toEqual(["Finale", "Intro", "Loop Point", "Opening"]);
  });

  it("FindSavedFilters", async () => {
    const data = await gql<{ findSavedFilters: { id: string; mode: string }[] }>(
      GQL.FindSavedFiltersDocument,
      { mode: "SCENES" },
    );
    expect(data.findSavedFilters.map((f) => f.id)).toEqual(["1", "2"]);
  });

  it("FindSavedFilter", async () => {
    const data = await gql<{ findSavedFilter: { id: string; name: string; find_filter: { sort: string | null } | null } | null }>(
      GQL.FindSavedFilterDocument,
      { id: "1" },
    );
    expect(data.findSavedFilter?.name).toBe("All Scenes");
    expect(data.findSavedFilter?.find_filter?.sort).toBe("date");
  });

  it("FindTagsForSelect (queryFindTagsByIDForSelect)", async () => {
    const data = await gql<{ findTags: { count: number; tags: { id: string; name: string }[] } }>(
      GQL.FindTagsForSelectDocument,
      { ids: ["tag-alpha", "tag-gamma"] },
    );
    expect(data.findTags.tags.map((t) => t.name).sort()).toEqual(["Alpha", "Gamma"]);
  });

  it("sceneStreams endpoint vocabulary", async () => {
    const response = await rawQuery(RAW_DOCS.sceneStreams, { id: "scene-1" });
    const body = (await response.json()) as {
      data?: { sceneStreams: { url: string; label: string | null }[] };
      errors?: unknown[];
    };
    expect(body.errors).toBeUndefined();
    expect(body.data?.sceneStreams.map((s) => s.label)).toContain("Direct stream");
  });
});

describe("mutations the app uses", () => {
  it("SceneUpdate (rating)", async () => {
    const data = await gql<{ sceneUpdate: { id: string; rating100: number | null } | null }>(
      GQL.SceneUpdateDocument,
      { input: { id: "scene-1", rating100: 80 } },
    );
    expect(data.sceneUpdate?.rating100).toBe(80);
  });

  it("SceneUpdate (tags replace)", async () => {
    const data = await gql<{ sceneUpdate: { id: string; tags: { id: string }[] } | null }>(
      GQL.SceneUpdateDocument,
      { input: { id: "scene-1", tag_ids: ["tag-beta"] } },
    );
    expect(data.sceneUpdate?.tags.map((t) => t.id)).toEqual(["tag-beta"]);
  });

  it("SceneAddO / SceneDeleteO (O-counter)", async () => {
    const added = await gql<{ sceneAddO: { count: number; history: string[] } }>(
      GQL.SceneAddODocument,
      { id: "scene-1" },
    );
    expect(added.sceneAddO.count).toBe(3); // fixture o_counter is 2
    const deleted = await gql<{ sceneDeleteO: { count: number; history: string[] } }>(
      GQL.SceneDeleteODocument,
      { id: "scene-1" },
    );
    expect(deleted.sceneDeleteO.count).toBe(2);
  });

  it("TagCreate adds a tag that queries then return", async () => {
    const created = await gql<{ tagCreate: { id: string; name: string } | null }>(GQL.TagCreateDocument, {
      input: { name: "Created Tag" },
    });
    const tagId = created.tagCreate!.id;
    expect(created.tagCreate!.name).toBe("Created Tag");

    const found = await gql<{ findTags: { tags: { id: string }[] } }>(GQL.FindTagsDocument, {
      filter: { q: "Created", per_page: -1 },
    });
    expect(found.findTags.tags.map((tag) => tag.id)).toContain(tagId);

    await gql(GQL.TagDestroyDocument, { id: tagId });
  });

  it("TagDestroy also deletes markers using the tag as their primary tag", async () => {
    const tagId = (await gql<{ tagCreate: { id: string } | null }>(GQL.TagCreateDocument, { input: { name: "Doomed" } }))
      .tagCreate!.id;
    const marker = await gql<{ sceneMarkerCreate: { id: string } | null }>(GQL.SceneMarkerCreateDocument, {
      title: "", seconds: 1, scene_id: "scene-2", primary_tag_id: tagId, tag_ids: [],
    });

    const destroyed = await gql<{ tagDestroy: boolean }>(GQL.TagDestroyDocument, { id: tagId });

    expect(destroyed.tagDestroy).toBe(true);
    expect(server.store.markers.has(marker.sceneMarkerCreate!.id)).toBe(false);
  });

  it("SceneMarkerCreate / SceneMarkerUpdate / SceneMarkerDestroy", async () => {
    const created = await gql<{ sceneMarkerCreate: { id: string; title: string; seconds: number; scene: { id: string } } | null }>(
      GQL.SceneMarkerCreateDocument,
      { title: "New Marker", seconds: 5, scene_id: "scene-2", primary_tag_id: "tag-delta", tag_ids: [] },
    );
    const markerId = created.sceneMarkerCreate!.id;
    expect(created.sceneMarkerCreate!.scene.id).toBe("scene-2");

    const updated = await gql<{ sceneMarkerUpdate: { id: string; title: string } | null }>(
      GQL.SceneMarkerUpdateDocument,
      { id: markerId, title: "Renamed Marker", seconds: 5, scene_id: "scene-2", primary_tag_id: "tag-delta", tag_ids: [] },
    );
    expect(updated.sceneMarkerUpdate?.title).toBe("Renamed Marker");

    const destroyed = await gql<{ sceneMarkerDestroy: boolean }>(GQL.SceneMarkerDestroyDocument, { id: markerId });
    expect(destroyed.sceneMarkerDestroy).toBe(true);
  });

  it("scenesDestroy", async () => {
    const destroyed = await gql<{ scenesDestroy: boolean }>(GQL.ScenesDestroyDocument, {
      ids: ["scene-8"],
      delete_file: false,
      delete_generated: false,
    });
    expect(destroyed.scenesDestroy).toBe(true);

    const after = await gql<{ findScenes: { count: number } }>(
      GQL.FindFullScenesDocument,
      { filter: { per_page: -1 } },
    );
    expect(after.findScenes.count).toBe(7);
  });

  it("ConfigurePlugin round-trips through Configuration", async () => {
    const result = await gql<Record<string, unknown>>(GQL.ConfigurePluginDocument, {
      plugin_id: "stash-tv",
      input: { volume: "0.5" },
    });
    expect(result.configurePlugin).toEqual({ volume: "0.5" });

    const config = await gql<{ configuration: { plugins: Record<string, Record<string, unknown>> } }>(
      GQL.ConfigurationDocument,
    );
    expect(config.configuration.plugins["stash-tv"]).toEqual({ volume: "0.5" });
  });
});

describe("subscriptions", () => {
  it("scanCompleteSubscribe delivers events", async () => {
    wsClient = createClient({ url: server.wsUrl, webSocketImpl: WebSocket, lazy: false });
    const received: unknown[] = [];

    // There's no signal for when the server has set up the subscription, so keep emitting until the first event
    // arrives. Emits before then reach no subscriber and are dropped.
    let trigger: ReturnType<typeof setInterval> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        wsClient.subscribe(
          { query: print(GQL.ScanCompleteSubscribeDocument) },
          {
            next: (value) => {
              received.push(value);
              resolve();
            },
            error: reject,
            complete: () => {},
          },
        );
        trigger = setInterval(() => server.triggerScanComplete(), 20);
      });
    } finally {
      clearInterval(trigger);
    }

    expect(received.length).toBeGreaterThan(0);
  });
});

describe("media routes", () => {
  it("serves a scene stream with range support", async () => {
    const response = await fetch(`${server.url}/scene/scene-1/stream.mp4`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    await response.body?.cancel();

    const partial = await fetch(`${server.url}/scene/scene-1/stream.mp4`, {
      headers: { range: "bytes=0-99" },
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    const bytes = await partial.arrayBuffer();
    expect(bytes.byteLength).toBe(100);
  });

  it("serves marker media", async () => {
    const preview = await fetch(`${server.url}/marker/marker-1/preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toBe("video/webm");
    await preview.body?.cancel();
  });
});

describe("tenants", () => {
  /** Run a raw operation as the given tenant (or none), returning its data */
  async function asTenant(tenant: string | undefined, query: string, variables?: Record<string, unknown>) {
    const response = await fetch(server.httpUrl, {
      method: "POST",
      headers: { "content-type": "application/json", ...(tenant ? { [MOCK_STASH_TENANT_HEADER]: tenant } : {}) },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
    expect(body.errors).toBeUndefined();
    return body.data;
  }
  const rateScene = (tenant: string | undefined, rating100: number) =>
    asTenant(tenant, "mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }", {
      input: { id: "scene-7", rating100 },
    });
  const rating = async (tenant: string | undefined) =>
    ((await asTenant(tenant, '{ findScene(id: "scene-7") { rating100 } }'))?.findScene as { rating100: number | null })
      .rating100;

  it("keeps each tenant's changes to itself, apart from the default store's", async () => {
    const before = await rating(undefined);

    await rateScene("tenant-a", 20);
    await rateScene("tenant-b", 80);

    expect(await rating("tenant-a")).toBe(20);
    expect(await rating("tenant-b")).toBe(80);
    expect(await rating(undefined)).toBe(before);
    expect(server.store.scenes.get("scene-7")?.rating100).toBe(before);
  });

  it("takes a tenant named in a cookie, as a browser names it", async () => {
    await rateScene("tenant-d", 40);

    const response = await fetch(server.httpUrl, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `other=1; ${MOCK_STASH_TENANT_COOKIE}=tenant-d` },
      body: JSON.stringify({ query: '{ findScene(id: "scene-7") { rating100 } }' }),
    });
    expect(((await response.json()) as { data: { findScene: { rating100: number } } }).data.findScene.rating100).toBe(40);
  });

  it("starts a new tenant from the fixtures", async () => {
    await rateScene(undefined, 60);

    expect(await rating("tenant-c")).toBeNull();
  });
});
