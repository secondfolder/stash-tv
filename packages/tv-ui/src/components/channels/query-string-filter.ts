import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ListFilterModel } from "stash-ui/dist/src/models/list-filter/filter";
import type { TemporaryFilter } from "./channel-config";
import { QUERY_STRING_FILTER_ENTITY_TYPE_PARAM, QUERY_STRING_FILTER_PARAMS } from "../../constants";

/**
 * Letting another plugin link into the feed with a filter, as the temporary channel, via Stash TV's own page URL.
 * Reuses Stash's own filter query-string format (the same params a native Scenes or Scene Markers page URL has), so a
 * filter can be shown without first being saved in Stash. Mirrors `getStashQueue`, for a general filter rather than
 * Stash's own scene-page queue.
 *
 * @see docs/channels.md § "Opening with a filter from another plugin"
 */

const QUERY_STRING_FILTER_NAME = "From URL";

/**
 * The filter described by the page's own query string, if there's one: the temporary filter showing it. Since Stash's
 * filter query-string format doesn't say whether it's a scene or a scene marker filter,
 * `QUERY_STRING_FILTER_ENTITY_TYPE_PARAM` disambiguates (scenes is the default).
 */
export function getQueryStringFilter(params: URLSearchParams): { filter: TemporaryFilter } | undefined {
  if (!QUERY_STRING_FILTER_PARAMS.some(key => params.has(key))) return undefined;

  const mode = params.get(QUERY_STRING_FILTER_ENTITY_TYPE_PARAM) === "marker"
    ? GQL.FilterMode.SceneMarkers
    : GQL.FilterMode.Scenes;

  const filter = new ListFilterModel(mode);
  filter.configureFromQueryString(params.toString());
  // The page is left out: the feed paginates itself, starting from the top of the filter's results.
  const { q, sort, direction } = filter.makeFindFilter();
  return {
    filter: {
      mode,
      name: QUERY_STRING_FILTER_NAME,
      find_filter: { q, sort, direction },
      object_filter: filter.makeSavedFilter(),
    },
  };
}

/** Take the filter's params off the page's URL, once it's showing, so reloading goes back to the startup channel */
export function removeQueryStringFilterParamsFromUrl() {
  const url = new URL(window.location.href);
  for (const param of [...QUERY_STRING_FILTER_PARAMS, QUERY_STRING_FILTER_ENTITY_TYPE_PARAM]) url.searchParams.delete(param);
  window.history.replaceState(window.history.state, "", url);
}
