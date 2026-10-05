import { describe, expect, it } from "vitest";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ListFilterModel } from "stash-ui/dist/src/models/list-filter/filter";
import { SceneQueue } from "stash-ui/dist/src/models/sceneQueue";
import { getStashQueue } from "../../../src/components/channels/stash-queue";
import type { TemporaryFilter } from "../../../src/components/channels/channel-config";

/**
 * Reading the queue Stash's scene page was playing from the URL params it describes it with.
 *
 * @see docs/channels.md § "Opening Stash's queue"
 */

/** The params of a scene page's URL playing the queue, as Stash makes them, plus the scene playing as the plugin adds it */
function queueParams(queue: SceneQueue, { sceneIndex = 0, sceneId }: { sceneIndex?: number, sceneId?: string } = {}) {
  const params = new URL(queue.makeLink("1", { sceneIndex }), "http://stash").searchParams
  if (sceneId) params.set("scene", sceneId)
  return params
}

/** What Stash searches with for the filter, as the feed does */
function searchOf(filter: TemporaryFilter) {
  const model = new ListFilterModel(filter.mode)
  model.configureFromSavedFilter({ ...filter, id: "" })
  return { findFilter: model.makeFindFilter(), sceneFilter: model.makeFilter() }
}

describe("getStashQueue", () => {
  it("shows a queue played from a scene list as its filter, from the top", () => {
    const list = new ListFilterModel(GQL.FilterMode.Scenes)
    list.configureFromQueryString("?sortby=title&sortdir=desc&q=dawn&c=(\"type\":\"rating100\",\"modifier\":\"GREATER_THAN\",\"value\":(\"value\":60))&p=3")
    const filter = getStashQueue(queueParams(SceneQueue.fromListFilterModel(list)))?.filter

    expect(filter).toMatchObject({ mode: GQL.FilterMode.Scenes, name: "Queue" })
    expect(filter?.scene_ids).toBeUndefined()
    const { findFilter, sceneFilter } = searchOf(filter!)
    expect(findFilter).toMatchObject({ q: "dawn", sort: "title", direction: GQL.SortDirectionEnum.Desc, page: 1 })
    expect(sceneFilter).toHaveProperty("rating100")
    expect(sceneFilter).toEqual(list.makeFilter())
  })

  it("shows a queue of hand-picked scenes as those scenes", () => {
    const queue = getStashQueue(queueParams(SceneQueue.fromSceneIDList(["4", "1", "6"])))

    expect(queue).toEqual({ filter: { mode: GQL.FilterMode.Scenes, name: "Queue", scene_ids: ["4", "1", "6"] } })
  })

  it("starts at the scene playing, loading up to the end of the queue's page Stash was showing to find it", () => {
    const list = new ListFilterModel(GQL.FilterMode.Scenes)
    list.configureFromQueryString("?sortby=title&p=2")
    // The 43rd scene on a list's 2nd page of 40 is its 83rd, on the queue's 3rd page of 40
    const queue = getStashQueue(queueParams(SceneQueue.fromListFilterModel(list), { sceneIndex: 42, sceneId: "7" }))

    expect(queue?.start).toEqual({ itemId: "scene:7", withinFirst: 3 * 40 })
  })

  it("starts a hand-picked queue at the scene playing, which is somewhere in it", () => {
    const queue = getStashQueue(queueParams(SceneQueue.fromSceneIDList(["4", "1", "6"]), { sceneId: "1" }))

    expect(queue?.start).toEqual({ itemId: "scene:1", withinFirst: 3 })
  })

  it("finds no queue when there isn't one", () => {
    expect(getStashQueue(new URLSearchParams("t=12&autoplay=true&scene=4"))).toBeUndefined()
  })
})
