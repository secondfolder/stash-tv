import React from "react";
import TextUtils from "stash-ui/dist/src/utils/text";
import ResolutionIcon from "../../../../assets/resolution.svg?react";
import { choice, labelOption, OptionsOf } from "../field-options";
import { defineField, Field, labelProps, SceneInfoFieldProps } from "./shared";

const schema = {
  /** Shown as e.g. "1080p" (`name`) or "1920×1080" (`dimensions`) */
  format: choice({ name: "Name (e.g. 1080p)", dimensions: "Width × height (e.g. 1920×1080)" }, "name", { label: "Show as" }),
  label: labelOption({ name: "Resolution", icons: { active: ResolutionIcon, inactive: ResolutionIcon }, allowNone: true, default: "none" }),
};

function ResolutionField({ scene, options: { format, label } }: SceneInfoFieldProps<OptionsOf<typeof schema>>) {
  const file = scene.files[0];
  if (!file?.width || !file?.height) return null;
  return <Field field={fieldDefinition} {...labelProps(schema.label, label, true)}>
    {format === "dimensions" ? `${file.width}×${file.height}` : TextUtils.resolution(file.width, file.height)}
  </Field>
}

export const fieldDefinition = defineField({ id: "resolution", label: "Resolution", component: ResolutionField, options: schema });
