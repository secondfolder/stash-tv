import React, { useEffect, useMemo, useState } from "react"
import * as yup from "yup";
import ActionButtonBase, { ActionButtonIcon } from "../ActionButtonBase";
import { createNewActionButtonConfig, sharedActionButtonSchema } from "../action-button-config";

import { ActionButtonIconName, actionButtonIcons } from "../icons";
import type { ActionButtonDefinitionInput } from "./index";
import cx from "classnames";
import { queryFindTagsByIDForSelect, useSceneMarkerCreate } from "stash-ui/dist/src/core/StashService";
import { VideoJsPlayer } from "video.js";
import { getLogger } from "@logtape/logtape";
import { MediaItem } from "../../../hooks/useMediaItems";
import { Tag } from "stash-ui/wrappers/components/TagSelect";
import { useFormik } from "formik";
import { Form } from "react-bootstrap";
import { MarkerTitleSuggest } from "stash-ui/dist/src/components/Shared/Select";
import { TagIdSelect } from "stash-ui/wrappers/components/TagIdSelect";
import Switch from "../../settings/Switch";
import { IconSelect } from "../../settings/IconSelect";
import { CreateMarkerPanel, DefaultMarkersPanel } from "../../MarkerPanels";

const logger = getLogger(["stash-tv", "CreateMarkerActionButton"])

const id = "create-marker";

const configSchema = sharedActionButtonSchema.shape({
  buttonType: yup.string().oneOf([id]).required(),
  iconId: yup.string().required(),
  markerDefaults: yup.object({
    title: yup.string(),
    primaryTagId: yup.string().required(),
    tagIds: yup.array().of(yup.string().required()).required(),
  }).nullable(),
})

export const buttonDefinition = {
  id,
  title: ({state, config}: {state: string, config?: Record<string, unknown>}) => {
    const invalidConfig = Boolean(config) && config?.buttonType !== id
    const markerDefaults = typeof config?.markerDefaults === "object" ? config.markerDefaults : null
    const tagId = markerDefaults && 'primaryTagId' in markerDefaults && typeof markerDefaults.primaryTagId === "string"
      ? markerDefaults.primaryTagId
      : null
    const [tag, setTag] = useState<Tag>()
    useEffect(() => {
      if (!tagId) return
      queryFindTagsByIDForSelect([tagId])
        .then(result => result.data.findTags.tags[0] && setTag(result.data.findTags.tags[0]))
    }, [tagId])
    if (invalidConfig) {
      logger.error("Invalid config for create marker action button title {*}", { config })
      return <strong>?</strong>
    }
    if (markerDefaults) {
      if (state === "active" || state === "inactive") {
        return <>
          {tag ? `Add/edit "${tag.name}" markers` : "Add/edit markers"}
        </>
      } else {
        logger.error("Unexpected state in CreateMarkerActionButton title function", {state})
      }
    }
    return <>Add/edit scene marker</>
  },
  icon: actionButtonIcons["add-marker"].states,
  components: {
    button: CreateMarkerActionButton,
    settings: SettingsForm,
  },
  isRepeatable: true,
  configSchema,
} as const satisfies ActionButtonDefinitionInput<yup.InferType<typeof configSchema>>;

export function CreateMarkerActionButton(
  {
    config,
    mediaItem,
    playerRef
}: {
    config: Record<string, unknown>,
    mediaItem: MediaItem,
    playerRef: React.RefObject<VideoJsPlayer>
  }
) {
  const parsedConfig = useMemo(() => {
    try {
      return buttonDefinition.configSchema.validateSync(config)
    } catch (error) {
      logger.error("Invalid config for create marker action button", { error, config })
      return undefined
    }
  }, [config])
  const markerDefaults = parsedConfig?.markerDefaults
  const scene = mediaItem.entityType === "scene" ? mediaItem.entity : undefined
  // Stash stores a marker without a title as "", so match an unset default title against that
  const defaultTitle = markerDefaults?.title ?? ""
  const existingMarkers = useMemo(
    () => (markerDefaults && scene?.scene_markers
      .filter(m => m.primary_tag.id === markerDefaults.primaryTagId && m.title === defaultTitle)) ?? [],
    [scene?.scene_markers, markerDefaults?.primaryTagId, defaultTitle]
  )

  const [sceneMarkerCreate] = useSceneMarkerCreate();

  if (!parsedConfig) return <strong>?</strong>
  if (!scene) return null

  const createMarkerFromDefaults = () => {
    if (!markerDefaults) return
    const currentTime = playerRef.current?.currentTime()
    if (currentTime === undefined) {
      logger.error("Player current time is undefined when creating quick marker", {sceneId: scene.id})
      return
    }
    sceneMarkerCreate({
      variables: {
        scene_id: scene.id,
        title: defaultTitle,
        primary_tag_id: markerDefaults.primaryTagId,
        tag_ids: markerDefaults.tagIds,
        seconds: currentTime,
        end_seconds: null,
      },
    });
  }
  if (!markerDefaults) {
    return <ActionButtonBase
      state="inactive"
      icon={buttonDefinition.icon}
      title={buttonDefinition.title}
      className={cx(buttonDefinition.id, "hide-on-ui-hide")}
      sidePanel={({close}) => (
        <CreateMarkerPanel scene={scene} close={close} />
      )}
    />
  }
  // Once the scene has a marker matching the defaults, the button offers to add another or edit the existing ones
  const hasExistingMarkers = existingMarkers.length > 0
  const renderSidePanel = hasExistingMarkers
    ? ({close}: {close: () => void}) => (
      <DefaultMarkersPanel
        sceneId={scene.id}
        markers={existingMarkers}
        onAddMarker={createMarkerFromDefaults}
        close={close}
      />
    )
    : null
  return <ActionButtonBase
    state={hasExistingMarkers ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    sidePanel={renderSidePanel}
    onClick={({toggleSidePanel}) => hasExistingMarkers ? toggleSidePanel() : createMarkerFromDefaults()}
    config={config}
  />
}

function SettingsForm({formik}: { formik: ReturnType<typeof useFormik<yup.InferType<typeof configSchema>>> }) {
  const { markerDefaults: markerDefaultsError, iconId: iconIdError, ...otherErrors } = formik.errors
  return <>
    <Form.Group>
      <Switch
        id="quick-add"
        checked={Boolean(formik.values.markerDefaults)}
        label="Create with defaults"
        onChange={event => formik.setFieldValue(
          "markerDefaults",
          event.target.checked
            ? createNewActionButtonConfig("create-marker", {includeMarkerDefaults: true}).markerDefaults
            : null
        )}
      />
      <Form.Text className="text-muted">
        Create a marker immediately when clicked with pre-defined details.
      </Form.Text>
    </Form.Group>
    {formik.values.markerDefaults && <CreateMarkerQuickAddForm formik={formik} />}
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

function CreateMarkerQuickAddForm({formik}: { formik: ReturnType<typeof useFormik<yup.InferType<typeof configSchema>>> }) {
  const customQuickCreateMarkerIcons = Object.entries(actionButtonIcons)
    .filter(([key, icon]) => icon.category.includes("marker") || icon.category.includes("general"))
    .map(([key, icon]) => ({
      value: key as ActionButtonIconName,
      label: <ActionButtonIcon
        iconDefinition={icon.states}
        state={"inactive"}
        size="max"
      />
    }))
  const { markerDefaults } = formik.values
  if (!markerDefaults) return null;
  const { iconId: iconIdError } = formik.errors
  // Formik doesn't type the nested markerDefaults correctly so we have to cast it
  const { title: titleError, primaryTagId: primaryTagIdError, tags: tagsError, ...otherErrors } = formik.errors.markerDefaults as { title?: string; primaryTagId?: string; tags?: string } || {}
  const touched = formik.touched.markerDefaults as { title?: boolean; primaryTagId?: boolean; tags?: boolean } | undefined || {}
  return <>
    <Form.Group>
      <label htmlFor="title">
        Title (optional)
      </label>
      <MarkerTitleSuggest
        initialMarkerTitle={markerDefaults.title || ""}
        onChange={(v) => formik.setFieldValue("markerDefaults.title", v)}
      />
      {touched.title && (
        <Form.Control.Feedback type="invalid">
          {titleError}
        </Form.Control.Feedback>
      )}
    </Form.Group>
    <Form.Group>
      <label htmlFor="primary-tag">
        Primary Tag (required)
      </label>
      <TagIdSelect
        inputId="primary-tag"
        ids={formik.values.markerDefaults?.primaryTagId ? [formik.values.markerDefaults.primaryTagId] : []}
        onSelect={(tags: Tag[]) => formik.setFieldValue("markerDefaults.primaryTagId", tags[0]?.id)}
        isClearable={false}
        hoverPlacement="right"
      />
      {touched.primaryTagId && (
        <Form.Control.Feedback type="invalid">
          {primaryTagIdError}
        </Form.Control.Feedback>
      )}
    </Form.Group>
    <Form.Group>
      <label htmlFor="tags">
        Tags (optional)
      </label>
      <TagIdSelect
        isMulti
        inputId="tags"
        ids={formik.values.markerDefaults?.tagIds || []}
        onSelect={(tags: Tag[]) => formik.setFieldValue("markerDefaults.tagIds", tags.map(t => t.id))}
        hoverPlacement="right"
      />
    </Form.Group>
    <Form.Group>
      <label htmlFor="button-icon">
        Action Button Icon
      </label>
      <IconSelect
        inputId="button-icon"
        value={customQuickCreateMarkerIcons.find(icon => icon.value === formik.values.iconId)}
        options={customQuickCreateMarkerIcons}
        onChange={
          (newValue: typeof customQuickCreateMarkerIcons[number] | null) =>
            formik.setFieldValue("iconId", (newValue && 'value' in newValue) ? newValue.value : "add-marker")
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
