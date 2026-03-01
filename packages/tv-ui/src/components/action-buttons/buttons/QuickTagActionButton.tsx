import React, { ReactNode, useEffect, useMemo, useState } from "react"
import * as yup from "yup";
import ActionButtonBase, { ActionButtonIcon } from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { ActionButtonIconName, actionButtonIcons } from "../icons";
import type { ActionButtonDefinition } from "./index";
import cx from "classnames";
import { queryFindTagsByIDForSelect } from "stash-ui/dist/src/core/StashService";
import { useMediaItemTags } from "../../../hooks/useMediaItemTags";
import { MediaItem } from "../../../hooks/useMediaItems";
import { getLogger } from "@logtape/logtape";
import { Tag } from "stash-ui/wrappers/components/TagSelect";
import { useFormik } from "formik";
import { Form } from "react-bootstrap";
import { TagIdSelect } from "stash-ui/wrappers/components/TagIdSelect";
import { IconSelect } from "../../settings/IconSelect";

const logger = getLogger(["stash-tv", "QuickTagActionButton"])

const id = "quick-tag";

const configSchema = sharedActionButtonSchema.shape({
  type: yup.string().oneOf([id]).required(),
  iconId: yup.string().required(),
  tagId: yup.string().required(),
})

export const buttonDefinition = {
  id,
  title: ({state, config}: {state: string, config?: Record<string, unknown>}) => {
    const [tag, setTag] = useState<Tag>()
    if (config && config.type !== id) {
      logger.error("Invalid config for quick tag action button title {*}", { config })
      return <strong>?</strong>
    }
    const tagId = config && 'tagId' in config && typeof config.tagId === 'string'
      ? config.tagId
      : null
    useEffect(() => {
      if (!tagId) return
      queryFindTagsByIDForSelect([tagId])
        .then(result => result.data.findTags.tags[0] && setTag(result.data.findTags.tags[0]))
    }, [tagId])
    if (state === "active") {
      return <>
        {tag ? `Remove "${tag.name}" from scene/marker` : "Remove tag from scene/marker"}
      </>
    } else if (state === "inactive") {
      return <>
        {tag ? `Add "${tag.name}" to scene/marker` : "Add tag to scene/marker"}
      </>
    } else {
      logger.error("Unexpected state in QuickTagActionButton title function", {state})
      return <strong>?</strong>
    }
  },
  icon: actionButtonIcons["add-tag"].states,
  components: {
    button: QuickTagActionButton,
    settings: SettingsForm,
  },
  isRepeatable: true,
  configSchema,
} as const satisfies ActionButtonDefinition<yup.InferType<typeof configSchema>>;

export function QuickTagActionButton({
  config,
  mediaItem
}: {
  config: Record<string, unknown>,
  mediaItem: MediaItem
}) {
  let parsedConfig
  try {
    parsedConfig = buttonDefinition.configSchema.validateSync(config)
  } catch (error) {
    logger.error("Invalid config for quick tag action button", { error, config })
    return <strong>?</strong>
  }
  const [tagName, setTagName] = useState<string>(`Tag ID: ${parsedConfig.tagId}`);
  let mediaItemHasTag: boolean
  let sidePanel: ReactNode = null
  const {addTag, removeTag} = useMediaItemTags(mediaItem);

  useEffect(() => {
    queryFindTagsByIDForSelect([parsedConfig.tagId])
      .then(result => setTagName(result.data.findTags.tags[0]?.name || tagName))
  }, [parsedConfig.tagId])


  if (mediaItem.entityType === "scene") {
    const scene = mediaItem.entity
    mediaItemHasTag = useMemo(() => scene.tags.some(t => t.id === parsedConfig.tagId), [scene.tags, parsedConfig.tagId])
  } else if (mediaItem.entityType === "marker") {
    const marker = mediaItem.entity
    mediaItemHasTag = useMemo(
      () => marker.tags.some(t => t.id === parsedConfig.tagId) || marker.primary_tag.id === parsedConfig.tagId,
      [marker.tags, parsedConfig.tagId]
    )
    sidePanel = marker.primary_tag.id == parsedConfig.tagId
      ? <>
        Marker's primary tag is "{tagName}" and a markers's primary tag cannot be removed.
      </>
      : null;
  } else {
    logger.error("QuickTagActionButton rendered for unsupported media item type", {mediaItem})
    return null
  }

  return <ActionButtonBase
    state={mediaItemHasTag ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    data-testid="MediaSlide--quickTagButton"
    onClick={mediaItemHasTag ? () => removeTag(parsedConfig.tagId) : () => addTag(parsedConfig.tagId)}
    sidePanel={sidePanel}
    config={config}
  />
}

function SettingsForm({
  formik
}: {
  formik: ReturnType<typeof useFormik<yup.InferType<typeof configSchema>>>
}) {
  const customQuickTagIcons = Object.entries(actionButtonIcons)
    .filter(([key, icon]) => icon.category.includes("tag") || icon.category.includes("general"))
    .map(([key, icon]) => ({
      value: key as ActionButtonIconName,
      label: <ActionButtonIcon
        iconDefinition={icon.states}
        state={"inactive"}
        size="max"
      />
    }))
  const { tagId: tagIdError, iconId: iconIdError, ...otherErrors } = formik.errors
  return <>
    <Form.Group>
      <label htmlFor="tag-id">
        Tag to add (required)
      </label>
      <TagIdSelect
        inputId="tag-id"
        onSelect={(tags: Array<{ id: string; name: string }>) => {
          const tag = tags[0] as Tag
          formik.setFieldValue("tagId", tag?.id)
        }}
        ids={formik.values.tagId ? [formik.values.tagId] : []}
        hoverPlacement="right"
      />
      {formik.touched.tagId && (
        <Form.Control.Feedback type="invalid">
          {tagIdError}
        </Form.Control.Feedback>
      )}
    </Form.Group>
    <Form.Group>
      <label htmlFor="button-icon">
        Action Button Icon
      </label>
      <IconSelect
        inputId="button-icon"
        value={customQuickTagIcons.find(icon => icon.value === formik.values.iconId)}
        options={customQuickTagIcons}
        onChange={
          (newValue: typeof customQuickTagIcons[number] | null) =>
            formik.setFieldValue("iconId", (newValue && 'value' in newValue) ? newValue.value : "add-tag")
        }
      />
      {formik.touched.iconId && (
        <Form.Control.Feedback type="invalid">
          {iconIdError}
        </Form.Control.Feedback>
      )}
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
