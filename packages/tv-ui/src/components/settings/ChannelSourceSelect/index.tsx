import React, { useMemo, useState } from "react";
import { Button, ButtonGroup } from "react-bootstrap";
import Select from "../Select";
import { useMediaItemFilters } from "../../../hooks/useMediaItemFilters";
import {
  ChannelSourceEntityType,
  ChannelSourceTarget,
  getAllMediaSourceName,
  getSourceTargetKey,
} from "../../channels/channel-config";
import "./ChannelSourceSelect.scss";

type Option = {
  value: string;
  label: string;
  source: ChannelSourceTarget;
}

const entityTypeLabels: Record<ChannelSourceEntityType, string> = {
  scene: "Scenes",
  marker: "Markers",
}

/**
 * Choose what a channel source points at. A button group picks scenes or markers, then a dropdown picks everything of
 * that type or one of its filters saved in Stash.
 */
export function ChannelSourceSelect({
  inputId,
  value,
  onChange,
}: {
  inputId?: string;
  value: ChannelSourceTarget | undefined;
  /** Called with undefined when switching type clears the chosen source */
  onChange: (source: ChannelSourceTarget | undefined) => void;
}) {
  const { availableSavedFilters, availableSavedFiltersLoading } = useMediaItemFilters()

  const valueEntityType = value?.type === "all"
    ? value.entityType
    : value?.type === "stash-saved-filter"
      ? availableSavedFilters.find(filter => filter.id === value.savedFilterId)?.entityType
      : undefined
  const [chosenEntityType, setChosenEntityType] = useState<ChannelSourceEntityType>()
  const entityType = chosenEntityType ?? valueEntityType ?? "scene"

  const options = useMemo((): Option[] => {
    const filtersOfType = availableSavedFilters.filter(filter => filter.entityType === entityType)
    const allMediaName = getAllMediaSourceName(entityType)
    const allMedia: Option = {
      value: getSourceTargetKey({ type: "all", entityType }),
      label: allMediaName,
      source: { type: "all", entityType },
    }
    // Many users have a filter in Stash with the same name (e.g. "All Scenes"), so only offer ours if they don't, or
    // if it's what's already chosen
    const showAllMedia = value?.type === "all"
      || !filtersOfType.some(filter => filter.name.trim().toLowerCase() === allMediaName.toLowerCase())
    const savedFilters = filtersOfType
      .map((filter): Option => ({
        value: getSourceTargetKey({ type: "stash-saved-filter", savedFilterId: filter.id }),
        label: filter.name,
        source: { type: "stash-saved-filter", savedFilterId: filter.id },
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return showAllMedia ? [allMedia, ...savedFilters] : savedFilters
  }, [availableSavedFilters, entityType, value?.type])

  const valueKey = value && getSourceTargetKey(value)
  const selectedOption = options.find(option => option.value === valueKey)

  return <div className="ChannelSourceSelect">
    <ButtonGroup className="entity-type" aria-label="Media type">
      {(["scene", "marker"] as const).map(buttonEntityType => {
        const active = buttonEntityType === entityType
        return <Button
          key={buttonEntityType}
          variant={active ? "primary" : "secondary"}
          className={buttonEntityType}
          active={active}
          aria-pressed={active}
          onClick={() => {
            if (active) return
            setChosenEntityType(buttonEntityType)
            // The chosen source is of the other type
            if (value) onChange(undefined)
          }}
        >
          {entityTypeLabels[buttonEntityType]}
        </Button>
      })}
    </ButtonGroup>
    <Select<Option>
      inputId={inputId}
      isLoading={availableSavedFiltersLoading}
      value={selectedOption ?? null}
      onChange={(option: Option | null) => option && onChange(option.source)}
      options={options}
      placeholder={`Choose ${entityType === "scene" ? "scenes" : "markers"} to show…`}
    />
  </div>
}
