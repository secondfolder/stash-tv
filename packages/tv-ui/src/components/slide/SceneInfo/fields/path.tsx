import React from "react";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

function PathField({ scene }: SceneInfoFieldProps) {
  const path = scene.files[0]?.path;
  if (!path) return null;
  return <Field field={fieldDefinition}>{path}</Field>
}

export const fieldDefinition = defineField({ id: "path", label: "File path", component: PathField });
