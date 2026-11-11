import React from "react"
import * as yup from "yup";
import { Search } from "react-bootstrap-icons";
import cx from "classnames";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import type { ActionButtonDefinitionInput } from "./index";
import { useGlobalState } from "../../../store/globalState";

const id = "search";

export const buttonDefinition = {
  id,
  title: {
    active: "Search",
    inactive: "Search",
  },
  // A single icon since the palette covers the button while it's open
  icon: Search,
  components: {
    button: SearchActionButton,
  },
  configSchema: sharedActionButtonSchema.shape({
    buttonType: yup.string().oneOf([id]).required(),
  }),
} as const satisfies ActionButtonDefinitionInput;

/**
 * Opens the search palette (rendered once, by `FeedPage`), as the `search` shortcut does.
 *
 * @see docs/search.md
 */
export function SearchActionButton() {
  const { set: setGlobalState } = useGlobalState();
  return <ActionButtonBase
    state="inactive"
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    onClick={() => setGlobalState("searchOpen", true)}
  />
}
