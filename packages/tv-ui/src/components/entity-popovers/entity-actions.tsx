import React from "react";
import { DashCircle, Funnel, PlusCircle } from "react-bootstrap-icons";
import { useTvConfig } from "../../store/tvConfig";
import { showTemporaryFilter } from "../../hooks/useMediaItemFilters";
import { getTemporaryFilter } from "../channels/channel-config";
import {
  addEntityToFilter,
  canAddEntityToFilter,
  canRemoveEntityFromFilter,
  FilterEntity,
  FilterEntityType,
  makeEntityFilter,
  removeEntityFromFilter,
} from "../channels/temporary-filter";
import { EntityPopoverAction } from "./EntityPopover";

/**
 * The buttons every entity's popover has: show the scenes that have it in the feed (in the temporary channel), and,
 * when there's a temporary channel, add it to that channel's filter or remove it from it.
 * There's no button opening it in Stash: its card's title links there.
 *
 * @see docs/entity-popovers.md § "Actions"
 */
export function EntityActions({ entityType, entity, mediaLabel }: {
  entityType: FilterEntityType
  entity: FilterEntity
  /** The scenes that have it, e.g. "scenes with this tag" */
  mediaLabel: string
}) {
  const temporaryFilter = getTemporaryFilter(useTvConfig(state => state.channels))
  return <>
    <EntityPopoverAction
      id="show-in-feed"
      label={`Show ${mediaLabel}`}
      icon={<Funnel aria-hidden />}
      onClick={() => showTemporaryFilter(makeEntityFilter(entityType, entity))}
    />
    {canAddEntityToFilter(temporaryFilter, entityType, entity) && <EntityPopoverAction
      id="add-to-filter"
      label="Add to channel filter"
      icon={<PlusCircle aria-hidden />}
      onClick={() => showTemporaryFilter(addEntityToFilter(temporaryFilter, entityType, entity))}
    />}
    {canRemoveEntityFromFilter(temporaryFilter, entityType, entity) && <EntityPopoverAction
      id="remove-from-filter"
      label="Remove from channel filter"
      icon={<DashCircle aria-hidden />}
      onClick={() => showTemporaryFilter(removeEntityFromFilter(temporaryFilter, entityType, entity))}
    />}
  </>
}
