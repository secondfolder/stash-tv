import React from "react";
import cx from "classnames";
import { useFindStudio } from "stash-ui/dist/src/core/StashService";
import { StudioCard } from "stash-ui/wrappers/components/StudioCard";
import { EntityPopover, EntityPopoverTriggerProps } from "../EntityPopover";
import { EntityActions } from "../entity-actions";
import { EntityPopoverCard } from "../EntityPopoverCard";
import { hasDefaultImage } from "../helpers";
import "./StudioPopover.css";

/** A studio's card, as Stash shows it, but without its image if it only has Stash's default one */
export function StudioPopoverCard({ id }: { id: string }) {
  const { data, loading, error } = useFindStudio(id);
  return <EntityPopoverCard
    className="studio-popover-card"
    entityLabel="studio"
    id={id}
    query={{ data: data?.findStudio, loading, error }}
  >
    {studio => <div className={cx("studio-popover-card", { "entity-card-no-image": hasDefaultImage(studio.image_path) })}>
      <StudioCard studio={studio} />
    </div>}
  </EntityPopoverCard>
}

/**
 * Opens a popover with the studio's card (its title linking to it in Stash), and a button to show its scenes (and its
 * sub-studios') in the feed, when what `children` renders is hovered over or clicked
 *
 * @see docs/entity-popovers.md
 */
export function StudioPopover({ studio, onOpenInStash, children }: {
  studio: { id: string; name: string };
  /** Called as something in its card is opened in Stash, e.g. to pause the video */
  onOpenInStash?: () => void;
  children: (props: EntityPopoverTriggerProps) => JSX.Element;
}) {
  return <EntityPopover
    className="StudioPopover"
    label={studio.name}
    card={<StudioPopoverCard id={studio.id} />}
    actions={<EntityActions entityType="studio" entity={studio} mediaLabel="scenes from this studio" />}
    onOpenStashLink={onOpenInStash}
  >
    {children}
  </EntityPopover>
}
