import React from "react";
import cx from "classnames";
import { useFindTag } from "stash-ui/dist/src/core/StashService";
import { TagCard } from "stash-ui/wrappers/components/TagCard";
import { EntityPopover, EntityPopoverTriggerProps } from "../EntityPopover";
import { EntityActions } from "../entity-actions";
import { EntityPopoverCard } from "../EntityPopoverCard";
import { hasDefaultImage } from "../helpers";
import "./TagPopover.css";

/**
 * A tag's card, as Stash's `TagPopoverCard` shows it, but without its image if it only has Stash's default one (still
 * with its favourite button)
 */
export function TagPopoverCard({ id }: { id: string }) {
  const { data, loading, error } = useFindTag(id);
  return <EntityPopoverCard className="tag-popover-card" entityLabel="tag" id={id} query={{ data: data?.findTag, loading, error }}>
    {tag => <div className={cx("tag-popover-card", { "no-image": hasDefaultImage(tag.image_path) })}>
      <TagCard tag={tag} zoomIndex={0} />
    </div>}
  </EntityPopoverCard>
}

/**
 * Opens a popover with the tag's card (its title linking to the tag in Stash), and buttons to show its scenes in the
 * feed, when what `children` renders is hovered over or clicked
 *
 * @see docs/entity-popovers.md
 */
export function TagPopover({ tag, onOpenInStash, children }: {
  tag: { id: string; name: string };
  /** Called as something in its card is opened in Stash, e.g. to pause the video */
  onOpenInStash?: () => void;
  children: (props: EntityPopoverTriggerProps) => JSX.Element;
}) {
  return <EntityPopover
    className="TagPopover"
    label={tag.name}
    card={<TagPopoverCard id={tag.id} />}
    actions={<EntityActions
      entityType="tag"
      entity={tag}
      mediaLabel="scenes with this tag"
    />}
    onOpenStashLink={onOpenInStash}
  >
    {children}
  </EntityPopover>
}
