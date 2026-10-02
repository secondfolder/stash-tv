import React, { useState } from "react";
import { Button, Form } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPenToSquare, faShuffle, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import cx from "classnames";
import { useTvConfig } from "../../../store/tvConfig";
import { useMediaItemFilters } from "../../../hooks/useMediaItemFilters";
import { AddConfigItemButton, ConfigList, ConfigListItem } from "../ConfigList";
import { ChannelSettingsModal } from "../ChannelSettingsModal";
import Select from "../Select";
import { ChannelConfig, ChannelSourceEntityType, createNewChannelConfig, getChannelSourceInfo, StartupChannel } from "../../channels/channel-config";
import "./ChannelSettings.scss";

// Shown before the names of filters to tell scene and marker filters apart
const savedFilterNamePrefixes: Record<ChannelSourceEntityType, string> = {
  scene: "Scenes: ",
  marker: "Markers: ",
}

const startupChannelOptions: { value: StartupChannel, label: string }[] = [
  { value: "last-viewed", label: "Last viewed" },
  { value: "first", label: "First in list" },
]

/**
 * The user's list of channels: reorder, add, edit, delete, and click one to show it in the feed.
 *
 * @see docs/channels.md
 */
export function ChannelSettings() {
  const { channels, startupChannel, set: setTvConfig } = useTvConfig()
  const { activeChannel, setActiveChannel, availableSavedFilters, availableSavedFiltersLoading } = useMediaItemFilters()

  const [channelDraft, setChannelDraft] = useState<ChannelConfig | null>(null)
  const isInChannelList = (channel: ChannelConfig) => channels.some(otherChannel => otherChannel.id === channel.id)

  const saveChannelDraft = (channel: ChannelConfig) => {
    if (isInChannelList(channel)) {
      setTvConfig("channels", channels.map(otherChannel => otherChannel.id === channel.id ? channel : otherChannel))
    } else {
      setTvConfig("channels", [...channels, channel])
      setActiveChannel(channel.id)
    }
  }

  return <>
    {channelDraft && <ChannelSettingsModal
      initialChannelConfig={channelDraft}
      operation={isInChannelList(channelDraft) ? "edit" : "add"}
      onClose={() => setChannelDraft(null)}
      onSave={channel => {
        saveChannelDraft(channel)
        setChannelDraft(null)
      }}
    />}
    <Form.Group className="ChannelSettings">
      <ConfigList<ChannelConfig>
        className="channel-list"
        items={channels}
        onItemsOrderChange={newOrder => setTvConfig("channels", newOrder)}
        getItemKey={channel => channel.id}
        renderItem={({ item: channel, items, getDragHandleProps }) => {
          const dragHandleProps = getDragHandleProps({className: "drag-handle"})
          // Channels have a single source for now
          const source = channel.sources[0]
          const sourceInfo = source && getChannelSourceInfo(source, availableSavedFilters, availableSavedFiltersLoading)
          const isActive = channel.id === activeChannel?.id
          return <ConfigListItem
            className={cx("channel", {active: isActive, missing: sourceInfo?.missing})}
            dragHandleProps={items.length > 1 ? dragHandleProps : undefined}
            title={<Button
              variant="link"
              className="select-channel"
              aria-current={isActive ? "true" : undefined}
              onClick={() => setActiveChannel(channel.id)}
            >
              <span className="channel-title">
                {source?.type === "stash-saved-filter" && sourceInfo?.entityType && <span className="channel-name-prefix">
                  {savedFilterNamePrefixes[sourceInfo.entityType]}
                </span>}
                <span className="channel-name">{sourceInfo?.name ?? "Empty channel"}</span>
              </span>
              {source?.randomise && !sourceInfo?.sortedRandomly && <FontAwesomeIcon
                className="randomised-icon"
                icon={faShuffle}
                title="Randomised"
              />}
            </Button>}
            controls={<>
              <Button
                variant="link"
                className={cx("edit-channel", "muted")}
                onClick={() => setChannelDraft(channel)}
                aria-label="Edit channel"
              >
                <FontAwesomeIcon icon={faPenToSquare} />
              </Button>
              {/* There must always be a channel to show */}
              {items.length > 1 && <Button
                variant="link"
                className={cx("delete-channel", "muted")}
                onClick={() => setTvConfig("channels", channels.filter(otherChannel => otherChannel !== channel))}
                aria-label="Delete channel"
              >
                <FontAwesomeIcon icon={faTrashCan} />
              </Button>}
            </>}
          />
        }}
      />
      {!channels.length && <Form.Text className="text-muted">
        Showing all scenes. Add a channel to choose what the feed shows.
      </Form.Text>}
      <div className="form-subgroup">
        <AddConfigItemButton
          className="add-channel"
          variant="primary"
          onClick={() => setChannelDraft(createNewChannelConfig())}
          title="Add channel"
        />
      </div>
    </Form.Group>
    <Form.Group>
      <label htmlFor="startup-channel">Channel on Startup</label>
      <Select<typeof startupChannelOptions[number]>
        inputId="startup-channel"
        value={startupChannelOptions.find(option => option.value === startupChannel) ?? null}
        onChange={(option: typeof startupChannelOptions[number] | null) => option && setTvConfig("startupChannel", option.value)}
        options={startupChannelOptions}
      />
      <Form.Text className="text-muted">Which channel to show when Stash TV opens.</Form.Text>
    </Form.Group>
  </>
}
