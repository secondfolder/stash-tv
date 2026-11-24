import React from "react";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

function VideoCodecField({ scene }: SceneInfoFieldProps) {
  const videoCodec = scene.files[0]?.video_codec;
  if (!videoCodec) return null;
  return <Field field={fieldDefinition}>
    {videoCodec}
  </Field>
}

export const fieldDefinition = defineField({ id: "video-codec", label: "Video Codec", component: VideoCodecField });
