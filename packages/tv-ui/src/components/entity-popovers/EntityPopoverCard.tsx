import React, { ReactNode } from "react";
import cx from "classnames";
import { LoadingIndicator } from "stash-ui/wrappers/components/shared/LoadingIndicator";

/**
 * An entity's card in its popover, once it's been fetched: a loading indicator until then, or what went wrong. As Stash's
 * popovers' cards (e.g. `TagPopoverCard`), but with errors small enough for a popover.
 */
export function EntityPopoverCard<Entity>({ className, entityLabel, id, query: { data, loading, error }, children }: {
  /** Its class, e.g. Stash's `tag-popover-card` */
  className: string
  /** What it is, e.g. "tag" */
  entityLabel: string
  id: string
  /** Fetching it (e.g. `useFindTag`'s result), with what was fetched as `data` */
  query: { data: Entity | null | undefined, loading: boolean, error?: { message: string } }
  children: (entity: Entity) => ReactNode
}) {
  if (loading) {
    return <div className={cx(`${className}-placeholder`, "entity-popover-card-placeholder")}>
      <LoadingIndicator card={true} message="" />
    </div>
  }
  if (error) return <div className="entity-popover-error">Error: {error.message}</div>
  if (!data) return <div className="entity-popover-error">No {entityLabel} found with id {id}.</div>
  return <>{children(data)}</>
}
