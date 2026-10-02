import React from "react"
import * as yup from "yup";
import { Button, Form } from "react-bootstrap";
import TvChannelOutlineIcon from "../../../assets/tv-channel-outline.svg?react";
import { useFormik } from "formik";
import { getLogger } from "@logtape/logtape";
import cx from "classnames";
import ActionButtonBase from "../ActionButtonBase";
import { sharedActionButtonSchema } from "../action-button-config";
import type { ActionButtonDefinitionInput } from "./index";
import { useTvConfig } from "../../../store/tvConfig";
import { useMediaItemFilters } from "../../../hooks/useMediaItemFilters";
import { useFeedback } from "../../FeedbackOverlay";
import { getNextOption } from "../../../helpers";
import { getChannelName } from "../../channels/channel-config";
import Switch from "../../settings/Switch";

const logger = getLogger(["stash-tv", "ChangeChannelActionButton"])

const id = "change-channel";

const configSchema = sharedActionButtonSchema.shape({
  buttonType: yup.string().oneOf([id]).required(),
  /** Step to the next channel on each press instead of opening a list of them */
  cycle: yup.boolean().optional(),
})

export const buttonDefinition = {
  id,
  title: {
    active: "Change channel",
    inactive: "Change channel",
  },
  // A single icon since the button has no active state
  icon: TvChannelOutlineIcon,
  components: {
    button: ChangeChannelActionButton,
    settings: SettingsForm,
  },
  configSchema,
} as const satisfies ActionButtonDefinitionInput<yup.InferType<typeof configSchema>>;

/**
 * Switches the feed to another channel: from a panel listing the channels, or with `cycle`, to the next channel on each
 * press (showing its name in the feedback overlay). Not shown while there's only one channel, as there's nothing to
 * change to.
 *
 * @see docs/action-buttons.md § "Per-Button Behaviour"
 */
export function ChangeChannelActionButton({
  config
}: {
  config: Record<string, unknown>
}) {
  let cycle = false
  try {
    cycle = buttonDefinition.configSchema.validateSync(config).cycle ?? false
  } catch (error) {
    logger.warn("Invalid config for change channel action button, falling back to the channel list", { error, config })
  }
  const { channels } = useTvConfig()
  const { activeChannel, setActiveChannel, availableSavedFilters, availableSavedFiltersLoading } = useMediaItemFilters()
  const { setFeedback } = useFeedback()

  const channelName = (channel: typeof channels[number]) => {
    const { prefix, name } = getChannelName(channel, availableSavedFilters, availableSavedFiltersLoading)
    return prefix + name
  }

  if (channels.length <= 1) return null

  return <ActionButtonBase
    state="inactive"
    icon={buttonDefinition.icon}
    title={buttonDefinition.title}
    className={cx(buttonDefinition.id, "hide-on-ui-hide")}
    sidePanelClassName="action-button-change-channel"
    onClick={cycle ? () => {
      // With no active channel (none have been set up) this starts at the first one
      const nextChannel = getNextOption(channels.map(channel => ({ value: channel.id, channel })), activeChannel?.id ?? "")
      if (!nextChannel) return
      setActiveChannel(nextChannel.channel.id)
      setFeedback(channelName(nextChannel.channel), { displayDuration: 3000 })
    } : undefined}
    sidePanel={cycle ? undefined : ({ close }) => <>
      {channels.map(channel => {
        const isActive = channel.id === activeChannel?.id
        return <Button
          key={channel.id}
          variant={isActive ? "primary" : "link"}
          aria-current={isActive ? "true" : undefined}
          onClick={() => {
            setActiveChannel(channel.id)
            close()
          }}
        >
          {channelName(channel)}
        </Button>
      })}
    </>}
  />
}

function SettingsForm({formik}: { formik: ReturnType<typeof useFormik<yup.InferType<typeof configSchema>>> }) {
  return <Form.Group>
    <Switch
      id="cycle-channels"
      checked={Boolean(formik.values.cycle)}
      label="Cycle through channels"
      onChange={event => formik.setFieldValue("cycle", event.target.checked)}
    />
    <Form.Text className="text-muted">
      Switch to the next channel each time the button is pressed, rather than choosing one from a list.
    </Form.Text>
  </Form.Group>
}
