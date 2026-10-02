import React from "react";
import { Eye, EyeFill } from "react-bootstrap-icons";
import { labelOption, OptionsOf } from "../field-options";
import { defineField, Field, labelProps, SceneInfoFieldProps } from "./shared";

const schema = {
  /** Labelled with an eye icon (an outline until the scene's been played) or the field's name */
  label: labelOption({
    name: "Play count",
    icons: { active: EyeFill, inactive: Eye },
    default: "icon",
    description: "With the icon, it shows before the scene's been played too, the icon an outline until it has.",
  }),
};

function PlayCountField({ scene, options: { label } }: SceneInfoFieldProps<OptionsOf<typeof schema>>) {
  const playCount = scene.play_count ?? 0;
  // With its icon, shown before the scene's been played too, its outline saying so
  if (!playCount && label === "text") return null;
  return <Field field={fieldDefinition} {...labelProps(schema.label, label, playCount > 0)}>{playCount}</Field>
}

export const fieldDefinition = defineField({ id: "play-count", label: "Play count", component: PlayCountField, options: schema });
