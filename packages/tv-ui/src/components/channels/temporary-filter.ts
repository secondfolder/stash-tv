import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import type { CriterionType, ILabeledId, ILabeledValueListValue, SavedObjectFilter } from "stash-ui/dist/src/models/list-filter/types";
import type { ISavedCriterion } from "stash-ui/dist/src/models/list-filter/criteria/criterion";
import type { TemporaryFilter } from "./channel-config";

/**
 * Making the filters temporary channels show, filtering by entities such as a tag (see `showTemporaryFilter` in
 * useMediaItemFilters). Filters are in the format Stash saves them in (`object_filter`'s criteria are in Stash's UI
 * shape, e.g. `{ value: { items: [{ id, label }], excluded, depth }, modifier }`), as that's what a channel's filter is.
 *
 * @see docs/channels.md § "Filtering by an entity"
 */

/** An entity media can be filtered by, as a criterion of a filter */
export type FilterEntity = { id: string; name: string }

const toLabeledId = (entity: FilterEntity): ILabeledId => ({ id: entity.id, label: entity.name })

/** How each kind of entity is filtered by: the criterion, and whether it's hierarchical (has a depth) */
const entityCriteria = {
  tag: { criterion: "tags", hierarchical: true },
} as const satisfies Record<string, { criterion: CriterionType; hierarchical: boolean }>

export type FilterEntityType = keyof typeof entityCriteria

/** A criterion listing entities (tags, performers…): hierarchical ones also have a depth */
type SavedListCriterion = ISavedCriterion<ILabeledValueListValue & { depth?: number }>

function isListCriterion(criterion: ISavedCriterion<unknown> | undefined): criterion is SavedListCriterion {
  const value = criterion?.value
  return typeof value === "object" && !!value && "items" in value && Array.isArray(value.items)
}

function getCriterion(filter: TemporaryFilter, entityType: FilterEntityType): SavedListCriterion | undefined {
  const criterion = filter.object_filter?.[entityCriteria[entityType].criterion]
  return isListCriterion(criterion) ? criterion : undefined
}

/** A filter's name: what it filters by, e.g. "Alpha & Beta" */
function getFilterName(objectFilter: SavedObjectFilter) {
  return Object.values(objectFilter)
    .flatMap(criterion => isListCriterion(criterion) ? criterion.value?.items.map(item => item.label) ?? [] : [])
    .join(" & ")
}

function withObjectFilter(filter: TemporaryFilter, objectFilter: SavedObjectFilter): TemporaryFilter {
  return { ...filter, name: getFilterName(objectFilter), object_filter: objectFilter }
}

/** A filter showing the scenes that have the entity (e.g. every scene with a tag) */
export function makeEntityFilter(entityType: FilterEntityType, entity: FilterEntity): TemporaryFilter {
  const { criterion, hierarchical } = entityCriteria[entityType]
  return withObjectFilter({ mode: GQL.FilterMode.Scenes, name: "" }, {
    [criterion]: {
      modifier: GQL.CriterionModifier.IncludesAll,
      value: { items: [toLabeledId(entity)], excluded: [], ...(hierarchical ? { depth: 0 } : {}) },
    },
  })
}

/**
 * Whether the entity can be added to the filter, so it shows only media that has the entity as well as what it filtered
 * by: it must already filter by that kind of entity, requiring all of them (a single one with "includes" is the same),
 * and not already require this one.
 */
export function canAddEntityToFilter(
  filter: TemporaryFilter | undefined,
  entityType: FilterEntityType,
  entity: FilterEntity,
): filter is TemporaryFilter {
  const criterion = filter && getCriterion(filter, entityType)
  const items = criterion?.value?.items
  if (!criterion || !items?.length) return false
  const requiresAll = criterion.modifier === GQL.CriterionModifier.IncludesAll
    || (criterion.modifier === GQL.CriterionModifier.Includes && items.length === 1)
  return requiresAll && !items.some(item => item.id === entity.id)
}

/** The filter, also requiring the entity (see `canAddEntityToFilter`) */
export function addEntityToFilter(filter: TemporaryFilter, entityType: FilterEntityType, entity: FilterEntity): TemporaryFilter {
  const { criterion: criterionName } = entityCriteria[entityType]
  const criterion = getCriterion(filter, entityType)
  if (!criterion?.value) return filter
  return withObjectFilter(filter, {
    ...filter.object_filter,
    [criterionName]: {
      ...criterion,
      modifier: GQL.CriterionModifier.IncludesAll,
      value: { ...criterion.value, items: [...criterion.value.items, toLabeledId(entity)] },
    },
  })
}

/**
 * Whether the entity can be removed from the filter: it must require it, and still filter by something once it's gone
 * (another of that kind of entity, or another criterion), as a filter with nothing left would show everything.
 */
export function canRemoveEntityFromFilter(
  filter: TemporaryFilter | undefined,
  entityType: FilterEntityType,
  entity: FilterEntity,
): filter is TemporaryFilter {
  const items = filter && getCriterion(filter, entityType)?.value?.items
  if (!filter || !items?.some(item => item.id === entity.id)) return false
  const otherCriteria = Object.keys(filter.object_filter ?? {}).filter(name => name !== entityCriteria[entityType].criterion)
  return items.length > 1 || otherCriteria.length > 0
}

/** The filter, no longer requiring the entity (see `canRemoveEntityFromFilter`) */
export function removeEntityFromFilter(filter: TemporaryFilter, entityType: FilterEntityType, entity: FilterEntity): TemporaryFilter {
  const { criterion: criterionName } = entityCriteria[entityType]
  const criterion = getCriterion(filter, entityType)
  if (!criterion?.value) return filter
  const { [criterionName]: _removed, ...otherCriteria } = filter.object_filter ?? {}
  const items = criterion.value.items.filter(item => item.id !== entity.id)
  return withObjectFilter(filter, items.length
    ? { ...otherCriteria, [criterionName]: { ...criterion, value: { ...criterion.value, items } } }
    // Without any of that kind of entity left, it no longer filters by them at all
    : otherCriteria)
}
