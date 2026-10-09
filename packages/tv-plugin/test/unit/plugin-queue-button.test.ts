/**
 * Plugin queue button tests
 *
 * Drives the ScenePage and SceneList patches from main.tsx, which add the button
 * opening the scene page's queue in Stash TV and the scene list's menu item
 * opening the list in it, and the links they open.
 *
 * @see docs/channels.md § "Opening Stash's queue"
 */

import { describe, it, expect } from "vitest";
import { afterPatchArgs, type MockReactElement } from "./plugin-api-mock";
import { importPlugin } from "./test-harness";

const Original = () => "original";

async function importSetUpPlugin() {
  const mock = await importPlugin({ plugins: { "stash-tv": { initialSetupComplete: true } } });
  const main = await import("../../main");
  return { mock, main };
}

describe("ScenePage patch", () => {
  it("renders the scene page with the queue button", async () => {
    const { mock } = await importSetUpPlugin();
    const patch = mock.patchFor("ScenePage");

    const result = patch.implementation({ id: "1" }, undefined, Original) as MockReactElement;
    const [page, button] = result.props.children as MockReactElement[];

    expect(result.type).toBe(mock.pluginApi.React.Fragment);
    expect(page.type).toBe(Original);
    expect(page.props).toMatchObject({ id: "1" });
    expect((button.type as { name?: string }).name).toBe("QueueTvButton");
  });

  it("hands another plugin's after patch the whole render, page included", async () => {
    const { mock } = await importSetUpPlugin();
    const patch = mock.patchFor("ScenePage");
    const args = [{ id: "1" }, undefined];

    const result = patch.implementation(...args, Original);

    expect(afterPatchArgs(args, result).at(-1)).toBe(result);
  });
});

describe("getQueueTvLink", () => {
  it("opens Stash TV with a filter queue's params and the scene playing, leaving out the scene page's others", async () => {
    const { main } = await importSetUpPlugin();

    const link = main.getQueueTvLink({
      pathname: "/scenes/12",
      search: "?qsort=title&qsortd=desc&qfq=dawn&qfc=a&qfc=b&qfp=2&autoplay=true&continue=true&t=30",
    });

    expect(link).toBe("/plugin/stash-tv/assets/app/?qsort=title&qsortd=desc&qfq=dawn&qfc=a&qfc=b&qfp=2&scene=12");
  });

  it("opens Stash TV with a hand-picked queue's scene ids and the scene playing", async () => {
    const { main } = await importSetUpPlugin();

    expect(main.getQueueTvLink({ pathname: "/scenes/1", search: "?qs=4&qs=1&t=5" }))
      .toBe("/plugin/stash-tv/assets/app/?qs=4&qs=1&scene=1");
  });
});

/** @see docs/channels.md § "Opening a scene list" */
describe("SceneList patch", () => {
  it("renders the scene list with the menu item opening it in Stash TV", async () => {
    const { mock } = await importSetUpPlugin();
    const patch = mock.patchFor("SceneList");
    const props = { filter: {}, selectedIds: new Set<string>() };

    const result = patch.implementation(props, undefined, Original) as MockReactElement;
    const [list, item] = result.props.children as MockReactElement[];

    expect(result.type).toBe(mock.pluginApi.React.Fragment);
    expect(list.type).toBe(Original);
    expect(list.props).toMatchObject(props);
    expect((item.type as { name?: string }).name).toBe("SceneListTvMenuItem");
    expect(item.props).toMatchObject(props);
  });
});

describe("getSceneListTvLink", () => {
  const filter = {
    getEncodedParams: () => ({ sortby: "title", sortdir: "desc", q: "dawn%20dusk", c: ["a", "b"], p: "3" }),
  };

  it("opens Stash TV with the list's filter as a queue from the top", async () => {
    const { main } = await importSetUpPlugin();

    expect(main.getSceneListTvLink(filter, new Set()))
      .toBe("/plugin/stash-tv/assets/app/?qsort=title&qsortd=desc&qfq=dawn%20dusk&qfc=a&qfc=b&qfp=1");
  });

  it("opens Stash TV with just the selected scenes, if any are", async () => {
    const { main } = await importSetUpPlugin();

    expect(main.getSceneListTvLink(filter, new Set(["4", "1"])))
      .toBe("/plugin/stash-tv/assets/app/?qs=4&qs=1");
  });
});
