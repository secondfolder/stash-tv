import * as yup from "yup";
import type { ActionButtonConfig } from "./buttons";

export const sharedActionButtonSchema = yup.object({
  id: yup.string().required(),
  pinned: yup.boolean().required(),
})

export const createNewActionButtonConfig = <ButtonType extends ActionButtonConfig["type"]>(
  type: ButtonType,
  options?: {includeMarkerDefaults?: boolean}
): Extract<ActionButtonConfig, { type: ButtonType }> => {
  const sharedDefaults = {
    id: `${Date.now()}-${Math.random().toString().slice(2)}` ,
    pinned: false
  }
  switch (type) {
    case "edit-tags":
      return {
        ...sharedDefaults,
        type,
        pinnedTagIds: [],
      } as unknown as Extract<ActionButtonConfig, { type: ButtonType }>
    case "quick-tag":
      return {
        ...sharedDefaults,
        type,
        iconId: "add-tag",
        tagId: "",
      } as unknown as Extract<ActionButtonConfig, { type: ButtonType }>
    case "create-marker":
      return {
        ...sharedDefaults,
        type,
        iconId: !options?.includeMarkerDefaults ? "add-marker" : "bookmark",
        markerDefaults: options?.includeMarkerDefaults ? {
          title: "",
          primaryTagId: "",
          tagIds: [],
        } : null
      } as unknown as Extract<ActionButtonConfig, { type: ButtonType }>
    default:
      return {
        ...sharedDefaults,
          type,
      } as unknown as Extract<ActionButtonConfig, { type: ButtonType }>
  }
}
