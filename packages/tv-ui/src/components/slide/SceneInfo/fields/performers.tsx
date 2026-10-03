import React from "react";
import { Person, PersonFill } from "react-bootstrap-icons";
import { sortPerformers } from "../../../../helpers";
import { labelOption, OptionsOf } from "../field-options";
import { PerformerPopover } from "../../../entity-popovers/PerformerPopover";
import { defineField, Field, joinAsSentence, labelProps, SceneInfoFieldProps } from "./shared";
import { getStashUrl } from "../../../../helpers/getStashOrigin";

const schema = {
  label: labelOption({ name: "Performers", icons: { active: PersonFill, inactive: Person }, allowNone: true, default: "icon" }),
};

function PerformersField({ scene, options: { label }, preview, onExternalLinkClick }: SceneInfoFieldProps<OptionsOf<typeof schema>>) {
  if (!scene.performers.length) return null;
  return <Field field={fieldDefinition} {...labelProps(schema.label, label, true)}>
    {joinAsSentence(sortPerformers(scene.performers).map(performer => {
      const href = getStashUrl(`/performers/${performer.id}`);
      if (preview) return <a href={href} target="_blank">{performer.name}</a>;
      // Opens the performer's popover, or with a modifier key (or middle click), the performer in Stash
      return <PerformerPopover performer={performer} ageFromDate={scene.date ?? undefined} onOpenInStash={onExternalLinkClick}>
        {triggerProps => <a href={href} target="_blank" {...triggerProps}>{performer.name}</a>}
      </PerformerPopover>;
    }))}
  </Field>
}

export const fieldDefinition = defineField({ id: "performers", label: "Performers", component: PerformersField, options: schema });
