import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { SceneQueue } from "stash-ui/dist/src/models/sceneQueue";
import type { TemporaryFilter } from "./channel-config";
import { STASH_QUEUE_PARAMS, STASH_QUEUE_SCENE_PARAM } from "../../constants";
import type { FeedStart } from "../../hooks/useMediaItems";

/**
 * Opening a queue of scenes from Stash's scene page in the feed, as the temporary channel. The Stash TV plugin's button
 * in the queue's controls opens Stash TV with the scene page's queue params, in the format Stash puts them in its URLs.
 *
 * @see docs/channels.md § "Opening Stash's queue"
 */

const QUEUE_FILTER_NAME = "Queue"

/**
 * The queue described by Stash's queue params, if there's one: the temporary filter showing it, and where in it the feed
 * starts (the scene Stash was playing, in `STASH_QUEUE_SCENE_PARAM`)
 */
export function getStashQueue(params: URLSearchParams): { filter: TemporaryFilter, start?: FeedStart } | undefined {
  const queue = SceneQueue.fromQueryParameters(params)
  const sceneId = params.get(STASH_QUEUE_SCENE_PARAM)
  const startAt = (withinFirst: number) => sceneId ? { start: { itemId: `scene:${sceneId}`, withinFirst } } : {}
  if (queue.query) {
    // The page is left out: the feed paginates itself, starting from the top of the queue. The scene playing is in
    // the queue's page Stash was showing, so the feed loads up to the end of it to find the scene.
    const { q, sort, direction } = queue.query.makeFindFilter()
    return {
      filter: {
        mode: GQL.FilterMode.Scenes,
        name: QUEUE_FILTER_NAME,
        find_filter: { q, sort, direction },
        object_filter: queue.query.makeSavedFilter(),
      },
      ...startAt(queue.query.currentPage * queue.query.itemsPerPage),
    }
  }
  if (queue.sceneIDs?.length) {
    return {
      filter: {
        mode: GQL.FilterMode.Scenes,
        name: QUEUE_FILTER_NAME,
        scene_ids: queue.sceneIDs.map(String),
      },
      ...startAt(queue.sceneIDs.length),
    }
  }
  return undefined
}

/** Take Stash's queue params off the page's URL, once the queue is showing, so reloading goes back to the startup channel */
export function removeStashQueueParamsFromUrl() {
  const url = new URL(window.location.href)
  for (const param of [...STASH_QUEUE_PARAMS, STASH_QUEUE_SCENE_PARAM]) url.searchParams.delete(param)
  window.history.replaceState(window.history.state, "", url)
}
