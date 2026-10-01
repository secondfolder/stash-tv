import React, { useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { useUID } from "react-uid";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { SceneMarkerForm } from "stash-ui/wrappers/components/SceneMarkerForm";
import { defaultMarkerToEdit, markerLabel, sortMarkersByStartTime } from "../../helpers/markers";
import Select from "../settings/Select";
import "./MarkerPanels.css";

type SceneMarker = GQL.SceneDataFragment["scene_markers"][number];
type MarkerOption = { value: string; label: string };

/**
 * Stash's form for adding a marker to the scene. If the scene already has markers, controls below it switch the form to
 * editing one of them instead.
 */
export function CreateMarkerPanel({
  scene,
  getPlayerPosition,
  close,
}: {
  scene: GQL.SceneDataFragment;
  getPlayerPosition: () => number | undefined;
  close: () => void;
}) {
  const [markerToEditId, setMarkerToEditId] = useState<string>();
  const markerToEdit = scene.scene_markers.find((marker) => marker.id === markerToEditId);
  if (markerToEdit) {
    return <EditMarkerForm sceneId={scene.id} marker={markerToEdit} close={close} />;
  }
  return (
    <div className="CreateMarkerPanel">
      <SceneMarkerForm className="action-button-create-marker" sceneID={scene.id} onClose={close} marker={undefined} />
      {scene.scene_markers.length > 0 && (
        <EditExistingMarkerControls
          markers={scene.scene_markers}
          getPlayerPosition={getPlayerPosition}
          onEdit={setMarkerToEditId}
        />
      )}
    </div>
  );
}

function EditExistingMarkerControls({
  markers,
  getPlayerPosition,
  onEdit,
}: {
  markers: SceneMarker[];
  getPlayerPosition: () => number | undefined;
  onEdit: (markerId: string) => void;
}) {
  const selectId = `edit-existing-marker-${useUID()}`;
  // Where the playhead was when the panel opened, so the suggested marker doesn't change as the video plays
  const [playerPosition] = useState(() => getPlayerPosition() ?? 0);
  const sortedMarkers = useMemo(() => sortMarkersByStartTime(markers), [markers]);
  const suggestedMarker = useMemo(
    () => defaultMarkerToEdit(sortedMarkers, { playerPosition, now: Date.now() }),
    [sortedMarkers, playerPosition]
  );
  const [chosenMarkerId, setChosenMarkerId] = useState<string>();
  const options = useMemo(
    () => sortedMarkers.map((marker) => ({ value: marker.id, label: markerLabel(marker) })),
    [sortedMarkers]
  );
  const selectedMarkerId = markers.some((marker) => marker.id === chosenMarkerId)
    ? chosenMarkerId
    : suggestedMarker?.id;

  return (
    <Form.Group className="edit-existing-marker">
      <Form.Label htmlFor={selectId}>Edit an existing marker</Form.Label>
      <div className="d-flex">
        <Select<MarkerOption>
          inputId={selectId}
          className="marker-select"
          value={options.find((option) => option.value === selectedMarkerId) ?? null}
          onChange={(option: MarkerOption | null) => option && setChosenMarkerId(option.value)}
          options={options}
          // Inline rather than portalled, since a portalled menu opens behind the side panel's outside-click backdrop.
          // And not fixed position, since the panel is positioned with a transform, which makes a fixed menu inside
          // it position relative to the panel instead of the viewport (putting it off screen).
          menuPortalTarget={null}
          menuPosition="absolute"
        />
        <Button
          variant="secondary"
          className="ml-2"
          disabled={!selectedMarkerId}
          onClick={() => selectedMarkerId && onEdit(selectedMarkerId)}
        >
          Edit
        </Button>
      </div>
    </Form.Group>
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
