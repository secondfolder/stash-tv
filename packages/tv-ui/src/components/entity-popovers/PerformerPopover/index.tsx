import React from "react";
import { useFindPerformer } from "stash-ui/dist/src/core/StashService";
import { PerformerCard } from "stash-ui/wrappers/components/PerformerCard";
import { EntityPopover, EntityPopoverTriggerProps } from "../EntityPopover";
import { EntityActions } from "../entity-actions";
import { EntityPopoverCard } from "../EntityPopoverCard";
import "./PerformerPopover.css";

/** A performer's card, as Stash shows it, with their age when the scene was made if given its date */
export function PerformerPopoverCard({ id, ageFromDate }: { id: string, ageFromDate?: string }) {
  const { data, loading, error } = useFindPerformer(id);
  return <EntityPopoverCard
    className="performer-popover-card"
    entityLabel="performer"
    id={id}
    query={{ data: data?.findPerformer, loading, error }}
  >
    {performer => <div className="performer-popover-card">
      <PerformerCard performer={performer} ageFromDate={ageFromDate} />
    </div>}
  </EntityPopoverCard>
}

/**
 * Opens a popover with the performer's card (its title linking to them in Stash), and buttons to show their scenes in
 * the feed, when what `children` renders is hovered over or clicked
 *
 * @see docs/entity-popovers.md
 */
export function PerformerPopover({ performer, ageFromDate, onOpenInStash, children }: {
  performer: { id: string; name: string };
  /** The date to give their age at, e.g. the scene's */
  ageFromDate?: string;
  /** Called as something in their card is opened in Stash, e.g. to pause the video */
  onOpenInStash?: () => void;
  children: (props: EntityPopoverTriggerProps) => JSX.Element;
}) {
  return <EntityPopover
    className="PerformerPopover"
    label={performer.name}
    card={<PerformerPopoverCard id={performer.id} ageFromDate={ageFromDate} />}
    actions={<EntityActions entityType="performer" entity={performer} mediaLabel="scenes with this performer" />}
    onOpenStashLink={onOpenInStash}
  >
    {children}
  </EntityPopover>
}
