import React from "react";
import { choice, OptionsOf } from "../field-options";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

const sizeLabels = {
  small: "Small",
  medium: "Medium",
  big: "Big",
} as const;

const schema = {
  size: choice(sizeLabels, "medium", {
    label: "Size",
    description: "Alone on its line, it's space between lines. Beside other fields, it's space between them.",
  }),
};

/** "Big spacer" and the like, telling a spacer's instances apart in the editor */
const instanceLabel = ({ size }: OptionsOf<typeof schema>) => `${sizeLabels[size]} spacer`;

/**
 * Space between fields: beside them on a line, or, alone on its line (with the line's other fields showing nothing),
 * above and below (see SceneInfo.css). In the editor's pills it's a line as long as the space, along the way it adds it.
 */
function SpacerField({ options, preview }: SceneInfoFieldProps<OptionsOf<typeof schema>>) {
  if (preview) {
    return <Field field={fieldDefinition} className={`spacer-preview spacer-${options.size}`}>
      <span className="spacer-line" role="img" aria-label={instanceLabel(options)} />
    </Field>;
  }
  return <Field field={fieldDefinition} className={`spacer-${options.size}`}><span aria-hidden /></Field>;
}

export const fieldDefinition = defineField({
  id: "spacer",
  label: "Spacer",
  component: SpacerField,
  options: schema,
  repeatable: true,
  instanceLabel,
});
