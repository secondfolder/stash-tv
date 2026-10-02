import React from "react";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

function DirectorField({ scene }: SceneInfoFieldProps) {
  if (!scene.director) return null;
  return <Field field={fieldDefinition} showLabel>{scene.director}</Field>
}

export const fieldDefinition = defineField({ id: "director", label: "Director", component: DirectorField });
