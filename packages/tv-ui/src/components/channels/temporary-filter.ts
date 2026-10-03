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

/**
 * How each kind of entity is filtered by: the criterion, the modifier requiring them, their depth if they're
 * hierarchical (0 for just that one, -1 for it and everything under it), and whether a filter can require more than one
 * of that kind at once (a scene has only one studio, so Stash only allows "includes" for studios)
 */
const entityCriteria = {
  tag: { criterion: "tags", modifier: GQL.CriterionModifier.IncludesAll, depth: 0, combinable: true },
  performer: { criterion: "performers", modifier: GQL.CriterionModifier.IncludesAll, depth: undefined, combinable: true },
  // With its sub-studios, as the info panel shows a studio's parents: a network's scenes are mostly its studios'
  studio: { criterion: "studios", modifier: GQL.CriterionModifier.Includes, depth: -1, combinable: false },
} as const satisfies Record<string, {
  criterion: CriterionType
  modifier: GQL.CriterionModifier
  depth: number | undefined
  combinable: boolean
}>

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

/** A criterion requiring the entity, as the kind of entity is filtered by (see `entityCriteria`) */
function makeEntityCriterion(entityType: FilterEntityType, entity: FilterEntity): SavedListCriterion {
  const { modifier, depth } = entityCriteria[entityType]
  return { modifier, value: { items: [toLabeledId(entity)], excluded: [], ...(depth !== undefined ? { depth } : {}) } }
}

/** A filter showing the scenes that have the entity (e.g. every scene with a tag) */
export function makeEntityFilter(entityType: FilterEntityType, entity: FilterEntity): TemporaryFilter {
  return withObjectFilter({ mode: GQL.FilterMode.Scenes, name: "" }, {
    [entityCriteria[entityType].criterion]: makeEntityCriterion(entityType, entity),
  })
}

/**
 * Whether the entity can be added to the filter, so it shows only media that has the entity as well as what it filtered
 * by, and doesn't already require it. A filter not filtering by that kind of entity yet gets a criterion for it (criteria
 * all have to match). One already filtering by that kind must require all of them (a single one with "includes" is the
 * same), and that kind must be one a filter can require more than one of (not studios).
 */
export function canAddEntityToFilter(
  filter: TemporaryFilter | undefined,
  entityType: FilterEntityType,
  entity: FilterEntity,
): filter is TemporaryFilter {
  if (!filter) return false
  const { criterion: criterionName, combinable } = entityCriteria[entityType]
  if (filter.object_filter?.[criterionName] === undefined) return true
  const criterion = getCriterion(filter, entityType)
  const items = criterion?.value?.items
  // One this doesn't know how to add to
  if (!criterion || !items) return false
  if (items.some(item => item.id === entity.id)) return false
  if (!items.length) return true
  const requiresAll = criterion.modifier === GQL.CriterionModifier.IncludesAll
    || (criterion.modifier === GQL.CriterionModifier.Includes && items.length === 1)
  return combinable && requiresAll
}

/** The filter, also requiring the entity (see `canAddEntityToFilter`) */
export function addEntityToFilter(filter: TemporaryFilter, entityType: FilterEntityType, entity: FilterEntity): TemporaryFilter {
  const { criterion: criterionName } = entityCriteria[entityType]
  const criterion = getCriterion(filter, entityType)
  return withObjectFilter(filter, {
    ...filter.object_filter,
    [criterionName]: criterion?.value?.items.length
      ? {
        ...criterion,
        modifier: GQL.CriterionModifier.IncludesAll,
        value: { ...criterion.value, items: [...criterion.value.items, toLabeledId(entity)] },
      }
      : makeEntityCriterion(entityType, entity),
  })
}

/**
 * Whether the entity can be removed from the filter: the filter must require it, and must still filter by something once
 * it's gone (another of that kind of entity, or another criterion), as a filter with nothing left would show everything.
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
