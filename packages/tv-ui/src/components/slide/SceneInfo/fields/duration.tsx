import React from "react";
import TextUtils from "stash-ui/dist/src/utils/text";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

function DurationField({ scene }: SceneInfoFieldProps) {
  const duration = scene.files[0]?.duration;
  if (!duration) return null;
  return <Field field={fieldDefinition} showLabel>
    {TextUtils.secondsToTimestamp(duration)}
  </Field>
}

export const fieldDefinition = defineField({ id: "duration", label: "Duration", component: DurationField });
