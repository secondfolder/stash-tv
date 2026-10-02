import React from "react";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

function UrlsField({ scene }: SceneInfoFieldProps) {
  if (!scene.urls.length) return null;
  return <Field field={fieldDefinition}>
    {scene.urls.map(url => (
      <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>
    ))}
  </Field>
}

export const fieldDefinition = defineField({ id: "urls", label: "URLs", component: UrlsField });
