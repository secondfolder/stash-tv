import React from "react";
import { Form } from "react-bootstrap";
import TvChannelOutlineIcon from "../../../assets/tv-channel-outline.svg?react";
import { ActionButtonIcon } from "../../action-buttons/ActionButtonBase";
import { ConfigItemModal } from "../ConfigItemModal";
import { ChannelSourceSelect } from "../ChannelSourceSelect";
import Switch from "../Switch";
import { getStashOrigin } from "../../../helpers/getStashOrigin";
import { useMediaItemFilters } from "../../../hooks/useMediaItemFilters";
import { ChannelConfig, channelConfigSchema, getChannelSourceInfo } from "../../channels/channel-config";

type Props = {
  initialChannelConfig: ChannelConfig;
  /** Whether the channel is being added to the list or is already in it */
  operation: "add" | "edit";
  onClose: () => void;
  onSave: (config: ChannelConfig) => void;
}

export const ChannelSettingsModal = ({ initialChannelConfig, operation, onClose, onSave }: Props) => {
  const { availableSavedFilters, availableSavedFiltersLoading } = useMediaItemFilters()

  return (
    <ConfigItemModal<ChannelConfig>
      className="ChannelSettingsModal"
      operation={operation}
      initialValues={initialChannelConfig}
      schema={channelConfigSchema}
      onClose={onClose}
      onSave={onSave}
      header={<>
        <ActionButtonIcon iconDefinition={TvChannelOutlineIcon} state="inactive" size="small" />
        <span>{operation === "add" ? "Add" : "Edit"} Channel</span>
      </>}
    >
      {formik => {
        // Channels have a single source for now
        const source = formik.values.sources[0]
        const sourceInfo = source && getChannelSourceInfo(source, availableSavedFilters, availableSavedFiltersLoading)
        const sourcesError = formik.submitCount > 0 && typeof formik.errors.sources === "string"
          ? formik.errors.sources
          : undefined
        return <>
          <Form.Group>
            <label htmlFor="channel-source">Show</label>
            <ChannelSourceSelect
              inputId="channel-source"
              value={source}
              onChange={target => formik.setFieldValue(
                "sources",
                target ? [{...target, randomise: source?.randomise ?? false}] : [],
              )}
            />
            {sourcesError && <Form.Text className="text-danger">{sourcesError}</Form.Text>}
            <Form.Text className="text-muted">
              Show every scene or marker, or a filter saved in Stash. To use a new filter create a
              {" "}<a href={new URL('/scenes', getStashOrigin()).toString()}>scene filter</a> or
              {" "}<a href={new URL('/scenes/markers', getStashOrigin()).toString()}>marker filter</a> in
              Stash and it will appear here.
            </Form.Text>
          </Form.Group>
          {source && <Form.Group>
            {sourceInfo?.sortedRandomly ? (
              <span>Filter sort order is random</span>
            ) : <>
              <Switch
                id="channel-source-randomise"
                checked={source.randomise}
                label="Randomise order"
                onChange={event => formik.setFieldValue("sources[0].randomise", event.target.checked)}
              />
              <Form.Text className="text-muted">Randomise the order of the media in this filter.</Form.Text>
            </>}
          </Form.Group>}
        </>
      }}
    </ConfigItemModal>
  )
}
