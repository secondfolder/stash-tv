import { describe, expect, it } from "vitest";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ListFilterModel } from "stash-ui/dist/src/models/list-filter/filter";
import { getQueryStringFilter } from "../../../src/components/channels/query-string-filter";
import type { TemporaryFilter } from "../../../src/components/channels/channel-config";

/**
 * Letting another plugin link into the feed with a filter from Stash TV's own page query string.
 *
 * @see docs/channels.md § "Opening with a filter from another plugin"
 */

/** What Stash searches with for the filter, as the feed does */
function searchOf(filter: TemporaryFilter) {
  const model = new ListFilterModel(filter.mode);
  model.configureFromSavedFilter({ ...filter, id: "" });
  return { findFilter: model.makeFindFilter(), sceneFilter: model.makeFilter() };
}

describe("getQueryStringFilter", () => {
  it("shows a scene filter built from Stash's own filter query-string params", () => {
    const list = new ListFilterModel(GQL.FilterMode.Scenes);
    list.configureFromQueryString("?sortby=title&sortdir=desc&q=dawn&c=(\"type\":\"rating100\",\"modifier\":\"GREATER_THAN\",\"value\":(\"value\":60))&p=3");
    const filter = getQueryStringFilter(new URLSearchParams(list.makeQueryParameters()))?.filter;

    expect(filter).toMatchObject({ mode: GQL.FilterMode.Scenes, name: "From URL" });
    const { findFilter, sceneFilter } = searchOf(filter!);
    // The page is dropped: the feed paginates itself from the top
    expect(findFilter).toMatchObject({ q: "dawn", sort: "title", direction: GQL.SortDirectionEnum.Desc, page: 1 });
    expect(sceneFilter).toHaveProperty("rating100");
    expect(sceneFilter).toEqual(list.makeFilter());
  });

  it("defaults to a scene filter, and switches to a scene marker filter with tvEntityType=marker", () => {
    const sceneFilter = getQueryStringFilter(new URLSearchParams("?sortby=title"))?.filter;
    expect(sceneFilter?.mode).toBe(GQL.FilterMode.Scenes);

    const markerFilter = getQueryStringFilter(new URLSearchParams("?sortby=title&tvEntityType=marker"))?.filter;
    expect(markerFilter?.mode).toBe(GQL.FilterMode.SceneMarkers);
  });

  it("finds no filter when the query string has none of Stash's filter params", () => {
    expect(getQueryStringFilter(new URLSearchParams("t=12&autoplay=true"))).toBeUndefined();
    // tvEntityType alone doesn't count as a filter
    expect(getQueryStringFilter(new URLSearchParams("tvEntityType=marker"))).toBeUndefined();
  });

  it("falls back gracefully to an unfiltered, default-sorted filter when a param is malformed", () => {
    const filter = getQueryStringFilter(new URLSearchParams("?sortby=title&c=not-valid-json&p=not-a-number&z=-5"))?.filter;

    expect(filter).toBeDefined();
    const { findFilter, sceneFilter } = searchOf(filter!);
    expect(findFilter.sort).toBe("title");
    expect(sceneFilter).toEqual({});
  });
});
