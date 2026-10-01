import React, { useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { SceneMarkerForm } from "stash-ui/wrappers/components/SceneMarkerForm";
import { markerLabel, sortMarkersByStartTime } from "../../helpers/markers";
import Select from "../settings/Select";
import "./MarkerPanels.css";

type SceneMarker = GQL.SceneDataFragment["scene_markers"][number];
type MarkerOption = { value: string; label: string };

const NEW_MARKER = "new";

/**
 * Stash's form for adding a marker to the scene. If the scene already has markers, a dropdown above the form switches
 * it to editing one of them instead.
 */
export function CreateMarkerPanel({ scene, close }: { scene: GQL.SceneDataFragment; close: () => void }) {
  const [selectedId, setSelectedId] = useState(NEW_MARKER);
  const markerToEdit = scene.scene_markers.find((marker) => marker.id === selectedId);
  const options = useMemo(
    () => [
      { value: NEW_MARKER, label: "Add new marker" },
      ...sortMarkersByStartTime(scene.scene_markers).map((marker) => ({
        value: marker.id,
        label: `Edit ${markerLabel(marker)}`,
      })),
    ],
    [scene.scene_markers]
  );

  return (
    <div className="CreateMarkerPanel">
      {scene.scene_markers.length > 0 && (
        <Select<MarkerOption>
          aria-label="Add or edit a marker"
          className="marker-select"
          value={options.find((option) => option.value === (markerToEdit?.id ?? NEW_MARKER))}
          onChange={(option: MarkerOption | null) => option && setSelectedId(option.value)}
          options={options}
          // Inline rather than portalled, since a portalled menu opens behind the side panel's outside-click backdrop.
          // And not fixed position, since the panel is positioned with a transform, which makes a fixed menu inside
          // it position relative to the panel instead of the viewport (putting it off screen).
          menuPortalTarget={null}
          menuPosition="absolute"
        />
      )}
      <SceneMarkerForm
        // Remount when switching markers so the form starts from the chosen marker rather than the previous one's edits
        key={markerToEdit?.id ?? NEW_MARKER}
        className="action-button-create-marker"
        sceneID={scene.id}
        onClose={close}
        marker={markerToEdit}
      />
    </div>
  );
}

/**
 * For a create-marker button with marker defaults, once the scene already has markers matching them: add another
 * marker from the defaults, or pick one of the existing ones to edit.
 */
export function DefaultMarkersPanel({
  sceneId,
  markers,
  onAddMarker,
  close,
}: {
  sceneId: string;
  /** The scene's markers matching the defaults */
  markers: SceneMarker[];
  onAddMarker: () => void;
  close: () => void;
}) {
  const [markerToEditId, setMarkerToEditId] = useState<string>();
  const markerToEdit = markers.find((marker) => marker.id === markerToEditId);
  if (markerToEdit) {
    return <EditMarkerForm sceneId={sceneId} marker={markerToEdit} close={close} />;
  }
  return (
    <div className="DefaultMarkersPanel">
      <Button
        variant="primary"
        onClick={() => {
          onAddMarker();
          close();
        }}
      >
        Add another "{markers[0]?.primary_tag.name}" marker
      </Button>
      <ul className="existing-markers">
        {sortMarkersByStartTime(markers).map((marker) => (
          <li key={marker.id}>
            <span className="label">{markerLabel(marker)}</span>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Edit ${markerLabel(marker)}`}
              onClick={() => setMarkerToEditId(marker.id)}
            >
              Edit
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditMarkerForm({ sceneId, marker, close }: { sceneId: string; marker: SceneMarker; close: () => void }) {
  return <SceneMarkerForm className="action-button-create-marker" sceneID={sceneId} onClose={close} marker={marker} />;
}
