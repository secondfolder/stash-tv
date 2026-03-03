import * as yup from "yup";
import type { ActionButtonConfig } from "./buttons";

export const sharedActionButtonSchema = yup.object({
  id: yup.string().required(),
  type: yup.string().oneOf(["button"]).required(),
  pinned: yup.boolean().required(),
})

export const createNewActionButtonConfig = <ButtonType extends ActionButtonConfig["buttonType"]>(
  type: ButtonType,
  options?: {includeMarkerDefaults?: boolean}
): Extract<ActionButtonConfig, { buttonType: ButtonType }> => {
  const sharedDefaults = {
    id: `${Date.now()}-${Math.random().toString().slice(2)}` ,
    type: "button" as const,
    pinned: false
  }
  const buttonType = type
  switch (buttonType) {
    case "edit-tags":
      return {
        ...sharedDefaults,
        buttonType,
        pinnedTagIds: [],
      } as unknown as Extract<ActionButtonConfig, { buttonType: ButtonType }>
    case "quick-tag":
      return {
        ...sharedDefaults,
        buttonType: buttonType,
        iconId: "add-tag",
        tagId: "",
      } as unknown as Extract<ActionButtonConfig, { buttonType: ButtonType }>
    case "create-marker":
      return {
        ...sharedDefaults,
        buttonType: buttonType,
        iconId: !options?.includeMarkerDefaults ? "add-marker" : "bookmark",
        markerDefaults: options?.includeMarkerDefaults ? {
          title: "",
          primaryTagId: "",
          tagIds: [],
        } : null
      } as unknown as Extract<ActionButtonConfig, { buttonType: ButtonType }>
    default:
      return {
        ...sharedDefaults,
          buttonType,
      } as unknown as Extract<ActionButtonConfig, { buttonType: ButtonType }>
  }
}
