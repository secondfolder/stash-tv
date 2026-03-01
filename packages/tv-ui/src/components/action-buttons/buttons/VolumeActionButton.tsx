import React from "react"
import * as yup from "yup";
import { useAppStateStore } from "../../../store/appStateStore";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import { faVolumeHigh as faVolume } from "@fortawesome/free-solid-svg-icons";

import VolumeMuteOutlineIcon from '../../../assets/volume-mute-outline.svg?react';
import type { ActionButtonDefinition } from "./index";
import cx from "classnames";
import { UAParser } from "ua-parser-js";
import Slider from "../../controls/slider";
import { getLogger } from "@logtape/logtape";
import { useFormik } from "formik";
import { Form } from "react-bootstrap";
import Switch from "../../settings/Switch";

const logger = getLogger(["stash-tv", "VolumeActionButton"])

const id = "volume";

const configSchema = sharedActionButtonSchema.shape({
  type: yup.string().oneOf([id]).required(),
  fullControl: yup.boolean().optional(),
})

export const buttonDefinition = {
  id,
  title: {
    active: "Volume",
    inactive: "Volume",
  },
  icon: {
    active: faVolume,
    inactive: VolumeMuteOutlineIcon,
  },
  components: {
    button: VolumeActionButton,
    settings: SettingsForm,
  },
  configSchema
} as const satisfies ActionButtonDefinition<yup.InferType<typeof configSchema>>;

export function VolumeActionButton({
  config
}: {
  config: Record<string, unknown>
}) {
  let controlVolumeLevel = false
  try {
    const parsedConfig = buttonDefinition.configSchema.validateSync(config)
    controlVolumeLevel = parsedConfig.fullControl ?? false
  } catch (error) {
    logger.warn("Invalid config for volume action button, falling back to mute toggle", { error, config })
  }
  const { volume, set: setAppSetting } = useAppStateStore();

  let clickHandler
  let sidePanel
  // iOS does not let us control a video's volume programmatically, just mute toggling
  if (controlVolumeLevel && !UAParser().os.name?.includes("iOS")) {
    sidePanel = (
      <Slider
        min={0}
        max={100}
        value={[volume * 100]}
        onValueChange={e => setAppSetting("volume", Number(e[0]) / 100)}
      />
    );
    clickHandler = undefined;
  } else {
    sidePanel = undefined;
    clickHandler = () => setAppSetting("volume", (prev) => prev ? 0 : 1);
  }

  return <ActionButtonBase
    state={Boolean(volume) ? "active" : "inactive"}
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "mute", "hide-on-ui-hide")}
    data-testid="MediaSlide--muteButton"
    onClick={clickHandler}
    sidePanel={sidePanel}
  />
}

function SettingsForm({formik}: { formik: ReturnType<typeof useFormik<yup.InferType<typeof configSchema>>> }) {
  const { fullControl: fullControlError, ...otherErrors } = formik.errors
  return <>
    <Form.Group>
      <Switch
        id="full-control"
        checked={Boolean(formik.values.fullControl)}
        label="Full volume control"
        onChange={event => formik.setFieldValue("fullControl", event.target.checked)}
      />
      <Form.Text className="text-muted">
        Enable full volume control rather than just mute/unmute. Note that this does not work on iOS devices due to
        platform limitations.
      </Form.Text>
      {formik.touched.fullControl && fullControlError && (
        <Form.Control.Feedback type="invalid">
          {fullControlError}
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
