import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import React, { useEffect, useState } from "react";
import { getLogger } from "@logtape/logtape";
import { ChevronLeft } from "react-bootstrap-icons";
import { queryFindStudio } from "stash-ui/dist/src/core/StashService";
import { defineField, Field, SceneInfoFieldProps } from "./shared";
import { StudioPopover } from "../../../entity-popovers/StudioPopover";
import { getStashUrl } from "../../../../helpers/getStashOrigin";

const logger = getLogger(["stash-tv", "SceneInfo"]);

type Studio = Exclude<GQL.SceneDataFragment["studio"], null | undefined>

const getStudioOwnershipChain = async (studio: Studio): Promise<Studio[]> => {
  const chain = [studio];
  let currentStudio = studio;
  while (currentStudio?.parent_studio) {
    const {data, error} = await queryFindStudio(currentStudio.parent_studio.id);
    if (error) {
      logger.error("Error fetching parent studio:", error);
      break;
    }
    const parentStudio = data?.findStudio;
    if (!parentStudio) break;
    chain.push(parentStudio);
    currentStudio = parentStudio;
  }
  return chain;
}

/** The studio, with the studios it belongs to (fetched, as the scene has only its own) */
function StudioField({ scene, preview, onExternalLinkClick }: SceneInfoFieldProps) {
  const [studioOwnershipChain, setStudioOwnershipChain] = useState<Studio[]>(scene.studio ? [scene.studio] : []);

  useEffect(() => {
    (async () => {
      if (!scene.studio) return;
      const chain = await getStudioOwnershipChain(scene.studio);
      setStudioOwnershipChain(chain);
    })();
  }, [scene.studio]);

  if (!scene.studio) return null;
  return <Field field={fieldDefinition}>
    {studioOwnershipChain
      .map((studio, i) => {
        const href = getStashUrl(`/studios/${studio.id}`)
        const renderedStudio = preview
          ? <a key={studio.id} href={href} target="_blank">{studio.name}</a>
          // Opens the studio's popover, or with a modifier key (or middle click), the studio in Stash
          : <StudioPopover key={studio.id} studio={studio} onOpenInStash={onExternalLinkClick}>
            {triggerProps => <a href={href} target="_blank" {...triggerProps}>{studio.name}</a>}
          </StudioPopover>
        return i > 0
          ? [
            <ChevronLeft
              className="separator"
              key={i}
            />,
            renderedStudio
          ]
          : renderedStudio
      })
      .flat()
    }
  </Field>
}

export const fieldDefinition = defineField({ id: "studio", label: "Studio", component: StudioField });
