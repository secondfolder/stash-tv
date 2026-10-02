import React from "react";
import { FormattedDate } from "react-intl";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

function DateField({ scene }: SceneInfoFieldProps) {
  if (!scene.date) return null;
  // As Stash shows it on the scene's page
  return <Field field={fieldDefinition}><FormattedDate value={scene.date} format="long" timeZone="utc" /></Field>
}

export const fieldDefinition = defineField({ id: "date", label: "Date", component: DateField });
