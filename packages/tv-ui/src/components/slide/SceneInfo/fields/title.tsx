import React from "react";
import escapeStringRegexp from "escape-string-regexp";
import { objectTitle } from "stash-ui/dist/src/core/files";
import { proxyPrefix } from "../../../../constants";
import { defineField, Field, SceneInfoFieldProps } from "./shared";
import { getStashUrl } from "../../../../helpers/getStashOrigin";

/** The title, linking to the scene in Stash */
function TitleField({ scene, onExternalLinkClick }: SceneInfoFieldProps) {
  let sceneUrl = scene.paths.stream?.split("/stream")[0]?.replace("/scene", "/scenes")
  if (sceneUrl && import.meta.env.STASH_ADDRESS) {
    const scenePath = new URL(sceneUrl).pathname.replace(new RegExp(`^${escapeStringRegexp(proxyPrefix)}`), "");
    sceneUrl = getStashUrl(scenePath);
  }
  return <Field field={fieldDefinition}>
    <a href={sceneUrl || ""} target="_blank" onClick={onExternalLinkClick}>
      <h5>
        {objectTitle(scene)}
      </h5>
    </a>
  </Field>
}

export const fieldDefinition = defineField({ id: "title", label: "Title", component: TitleField });
