import React from "react";
import { Person, PersonFill } from "react-bootstrap-icons";
import { sortPerformers } from "../../../../helpers";
import { labelOption, OptionsOf } from "../field-options";
import { defineField, Field, joinAsSentence, labelProps, SceneInfoFieldProps } from "./shared";
import { getStashUrl } from "../../../../helpers/getStashOrigin";

const schema = {
  label: labelOption({ name: "Performers", icons: { active: PersonFill, inactive: Person }, allowNone: true, default: "icon" }),
};

function PerformersField({ scene, options: { label } }: SceneInfoFieldProps<OptionsOf<typeof schema>>) {
  if (!scene.performers.length) return null;
  return <Field field={fieldDefinition} {...labelProps(schema.label, label, true)}>
    {joinAsSentence(sortPerformers(scene.performers).map(performer => (
      <a href={getStashUrl(`/performers/${performer.id}`)} target="_blank">
        {performer.name}
      </a>
    )))}
  </Field>
}

export const fieldDefinition = defineField({ id: "performers", label: "Performers", component: PerformersField, options: schema });
