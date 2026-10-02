import React from "react";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

function CodeField({ scene }: SceneInfoFieldProps) {
  if (!scene.code) return null;
  return <Field field={fieldDefinition} showLabel>{scene.code}</Field>
}

export const fieldDefinition = defineField({ id: "code", label: "Studio code", component: CodeField });
