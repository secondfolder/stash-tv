import React from "react"
import * as yup from "yup";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";

import { actionButtonIcons } from "../icons";
import type { ActionButtonDefinition } from "./index";
import cx from "classnames";
import { useMediaItemTags } from "../../../hooks/useMediaItemTags";
import { MediaItem } from "../../../hooks/useMediaItems";
import { EditTagSelectionForm } from "../../EditTagSelectionForm";
import { getLogger } from "@logtape/logtape";
import { useFormik } from "formik";
import { Form } from "react-bootstrap";
import { TagIdSelect } from "stash-ui/wrappers/components/TagIdSelect";
import { Tag } from "stash-ui/wrappers/components/TagSelect";

const logger = getLogger(["stash-tv", "EditTagsActionButton"])

const id = "edit-tags";

const configSchema = sharedActionButtonSchema.shape({
  type: yup.string().oneOf([id]).required(),
  pinnedTagIds: yup.array().of(yup.string().required()).required(),
})

export const buttonDefinition = {
  id,
  title: {
    active: "Edit scene/marker tags",
    inactive: "Edit scene/marker tags",
  },
  icon: actionButtonIcons["tags"].states,
  components: {
    button: EditTagsActionButton,
    settings: SettingsForm,
  },
  configSchema
} as const satisfies ActionButtonDefinition<yup.InferType<typeof configSchema>>;

export function EditTagsActionButton({
  config,
  mediaItem
}: {
  config: Record<string, unknown>,
  mediaItem: MediaItem
}) {
  const {tags, primaryTag, setTags} = useMediaItemTags(mediaItem)
  let pinnedTagIds: string[] = []
  try {
    const parsedConfig = buttonDefinition.configSchema.validateSync(config)
    pinnedTagIds = parsedConfig.pinnedTagIds
  } catch (error) {
    logger.warn("Invalid config for edit tags action button", { error, config })
  }

  return <ActionButtonBase
    state="inactive"
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    sidePanel={({close}) => <>
      <EditTagSelectionForm
        initialTags={tags}
        pinnedTagIds={pinnedTagIds}
        save={setTags}
        cancel={close}
      />
      {primaryTag && <div className="primary-tag-note">
        Marker's primary tag is "{primaryTag.name}".
      </div>}
    </>}
    sidePanelClassName="action-button-side-panel-edit-tags"
    data-testid="MediaSlide--editTagsButton"
  />
}

function SettingsForm({formik}: { formik: ReturnType<typeof useFormik<yup.InferType<typeof configSchema>>> }) {
  const { pinnedTagIds: pinnedTagIdsError, ...otherErrors } = formik.errors
  return <>
    <Form.Group>
      <label htmlFor="pinned-tags">
        Pinned Tags (optional)
      </label>
      <TagIdSelect
        isMulti
        inputId="pinned-tags"
        ids={formik.values.pinnedTagIds || []}
        onSelect={(tags: Tag[]) => formik.setFieldValue("pinnedTagIds", tags.map(t => t.id))}
        hoverPlacement="right"
      />
      {formik.touched.pinnedTagIds && (
        <Form.Control.Feedback type="invalid">
          {pinnedTagIdsError}
        </Form.Control.Feedback>
      )}
      <Form.Text className="text-muted">
        Pinned tags allow you to quickly add your most used tags.
      </Form.Text>
    </Form.Group>
    {Object.keys(otherErrors).length > 0 && (
      <Form.Control.Feedback type="invalid">
        <ul>
          {Object.entries(otherErrors).map(([key, error]) => (
            <li key={key}>{error}</li>
          ))}
        </ul>
      </Form.Control.Feedback>
    )}
  </>
}
