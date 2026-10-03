import { describe, expect, it } from "vitest";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ListFilterModel } from "stash-ui/dist/src/models/list-filter/filter";
import {
  addEntityToFilter,
  canAddEntityToFilter,
  canRemoveEntityFromFilter,
  makeEntityFilter,
  removeEntityFromFilter,
} from "../../../src/components/channels/temporary-filter";
import type { TemporaryFilter } from "../../../src/components/channels/channel-config";

/**
 * The filters temporary channels show when filtering by an entity, e.g. "Show scenes with this tag" in a tag's popover.
 *
 * @see docs/channels.md § "Filtering by an entity"
 */

const alpha = { id: "tag-alpha", name: "Alpha" };
const beta = { id: "tag-beta", name: "Beta" };

/** The scene filter Stash makes from the filter, as the feed searches with */
function sceneFilterOf(filter: TemporaryFilter) {
  const model = new ListFilterModel(filter.mode);
  model.configureFromSavedFilter({ ...filter, id: "" });
  return model.makeFilter();
}

describe("temporary filters", () => {
  it("filters by an entity as Stash reads it: scenes with the tag", () => {
    const filter = makeEntityFilter("tag", alpha);

    expect(filter.mode).toBe(GQL.FilterMode.Scenes);
    expect(filter.name).toBe("Alpha");
    expect(sceneFilterOf(filter)).toEqual({
      tags: { value: ["tag-alpha"], excludes: [], modifier: GQL.CriterionModifier.IncludesAll, depth: 0 },
    });
  });

  it("adds an entity so the filter requires all of them, named after them all", () => {
    const filter = addEntityToFilter(makeEntityFilter("tag", alpha), "tag", beta);

    expect(filter.name).toBe("Alpha & Beta");
    expect(sceneFilterOf(filter)).toEqual({
      tags: { value: ["tag-alpha", "tag-beta"], excludes: [], modifier: GQL.CriterionModifier.IncludesAll, depth: 0 },
    });
  });

  it("offers adding an entity only to a filter requiring all of that kind of entity, and not already this one", () => {
    const alphaFilter = makeEntityFilter("tag", alpha);
    const anyOfFilter: TemporaryFilter = {
      ...alphaFilter,
      object_filter: {
        tags: {
          modifier: GQL.CriterionModifier.Includes,
          value: { items: [{ id: "tag-alpha", label: "Alpha" }, { id: "tag-gamma", label: "Gamma" }], excluded: [], depth: 0 },
        },
      },
    };
    const noTagsFilter: TemporaryFilter = { ...alphaFilter, object_filter: {} };

    expect(canAddEntityToFilter(alphaFilter, "tag", beta)).toBe(true);
    expect(canAddEntityToFilter(alphaFilter, "tag", alpha)).toBe(false);
    expect(canAddEntityToFilter(anyOfFilter, "tag", beta)).toBe(false);
    expect(canAddEntityToFilter(noTagsFilter, "tag", beta)).toBe(false);
    expect(canAddEntityToFilter(undefined, "tag", beta)).toBe(false);
  });

  it("removes an entity from the filter, renaming it after those left", () => {
    const filter = removeEntityFromFilter(addEntityToFilter(makeEntityFilter("tag", alpha), "tag", beta), "tag", alpha);

    expect(filter.name).toBe("Beta");
    expect(sceneFilterOf(filter)).toEqual({
      tags: { value: ["tag-beta"], excludes: [], modifier: GQL.CriterionModifier.IncludesAll, depth: 0 },
    });
  });

  it("offers removing an entity only from a filter requiring it, which would still filter by something without it", () => {
    const alphaFilter = makeEntityFilter("tag", alpha);
    const alphaAndBetaFilter = addEntityToFilter(alphaFilter, "tag", beta);
    const alphaAndRatingFilter: TemporaryFilter = {
      ...alphaFilter,
      object_filter: {
        ...alphaFilter.object_filter,
        rating100: { modifier: GQL.CriterionModifier.GreaterThan, value: { value: 60, value2: undefined } },
      },
    };

    expect(canRemoveEntityFromFilter(alphaAndBetaFilter, "tag", alpha)).toBe(true);
    expect(canRemoveEntityFromFilter(alphaAndRatingFilter, "tag", alpha)).toBe(true);
    expect(canRemoveEntityFromFilter(alphaFilter, "tag", alpha)).toBe(false);
    expect(canRemoveEntityFromFilter(alphaAndBetaFilter, "tag", { id: "tag-gamma", name: "Gamma" })).toBe(false);
    expect(canRemoveEntityFromFilter(undefined, "tag", alpha)).toBe(false);
  });

  it("stops filtering by a kind of entity once none of it is left", () => {
    const alphaFilter = makeEntityFilter("tag", alpha);
    const alphaAndRatingFilter: TemporaryFilter = {
      ...alphaFilter,
      object_filter: {
        ...alphaFilter.object_filter,
        rating100: { modifier: GQL.CriterionModifier.GreaterThan, value: { value: 60, value2: undefined } },
      },
    };

    const filter = removeEntityFromFilter(alphaAndRatingFilter, "tag", alpha);

    expect(sceneFilterOf(filter)).toEqual({ rating100: { modifier: GQL.CriterionModifier.GreaterThan, value: 60 } });
  });
});
