import React from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

function FrameRateField({ scene }: SceneInfoFieldProps) {
  const intl = useIntl();
  const frameRate = scene.files[0]?.frame_rate;
  if (!frameRate) return null;
  // Stash's own wording, e.g. "30 fps"
  return <Field field={fieldDefinition}>
    <FormattedMessage id="frames_per_second" values={{ value: intl.formatNumber(frameRate) }} />
  </Field>
}

export const fieldDefinition = defineField({ id: "frame-rate", label: "Frame rate", component: FrameRateField });
