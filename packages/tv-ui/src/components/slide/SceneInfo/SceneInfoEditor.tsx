import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import React, { useMemo, useState } from "react";
import cx from "classnames";
import { Button, ButtonGroup } from "react-bootstrap";
import { GearFill } from "react-bootstrap-icons";
import { SceneInfoField } from "./fields";
import { SceneInfoFieldOptionsModal } from "./SceneInfoFieldOptionsModal";
import { LineLayoutEditor } from "../../LineLayoutEditor";
import { replaceItem } from "../../LineLayoutEditor/line-layout";
import { useWindowSize } from "../../../hooks/useWindowSize";
import { useGlobalState } from "../../../store/globalState";
import {
  entryField,
  entryKey,
  entryLabel,
  fieldsNotInLayout,
  hasFieldOptions,
  isKnownField,
  isRepeatableField,
  newFieldInstance,
  noValueLabel,
  resolveFieldOptions,
  SceneInfoEditorPillContent,
  SceneInfoFieldOptions,
  SceneInfoFieldOptionsConfig,
  SceneInfoLayout,
  SceneInfoLayoutEntry,
} from "./scene-info-config";

const shownValuesLabels: Record<SceneInfoEditorPillContent, string> = {
  names: "Field name",
  values: "Field value",
};

/**
 * The panel's fields as pills, laid out on the lines they're shown on, for dragging about (see LineLayoutEditor), and
 * the fields not in the panel listed below (or beside) them to drag in.
 */
export function SceneInfoEditor({
  scene, layout, onChange, fieldOptionsConfig, onFieldOptionsChange, onReset, isDefault, onSave, onCancel, beforePillsChange,
}: {
  scene: GQL.SceneDataFragment;
  layout: SceneInfoLayout;
  onChange: (layout: SceneInfoLayout) => void;
  /** The fields' options as edited so far (each repeatable field's instance's are its own, in the layout) */
  fieldOptionsConfig: SceneInfoFieldOptionsConfig;
  /** Sets a field's options (an instance of a repeatable field's are its own, in the layout, so they're set with `onChange`) */
  onFieldOptionsChange: (field: string, options: object) => void;
  onReset: () => void;
  /** Whether the layout is the default one, which hides "Reset to default" as in the settings */
  isDefault: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** Called just before the pills switch between names and values, to morph them from how they look now */
  beforePillsChange?: () => void;
}) {
  // Global state, as each slide has its own editor, so it's kept moving to another slide while editing
  const { sceneInfoEditorPillContent: shownValues, set: setGlobalState } = useGlobalState();
  const setShownValues = (content: SceneInfoEditorPillContent) => {
    if (content === shownValues) return;
    beforePillsChange?.();
    setGlobalState("sceneInfoEditorPillContent", content);
  };
  // Side by side when the screen's wider than it's tall (useWindowSize allows for forced landscape)
  const { orientation } = useWindowSize();
  const showValues = shownValues === "values";
  // The field (or repeatable field's instance) whose options dialog is open
  const [optionsEntry, setOptionsEntry] = useState<SceneInfoLayoutEntry | null>(null);
  const fieldOptions = useMemo(() => resolveFieldOptions(fieldOptionsConfig), [fieldOptionsConfig]);
  /** The options of a field, or of a repeatable field's instance, its own */
  const optionsFor = (entry: SceneInfoLayoutEntry) => (
    typeof entry === "string" ? fieldOptions : resolveFieldOptions(fieldOptionsConfig, entry)
  );
  /** What a field (or an instance of one) is called on its pill, e.g. "Rating" or "Big spacer" */
  const nameOf = (entry: SceneInfoLayoutEntry) => entryLabel(entry, optionsFor(entry));

  const toolbar = <div className="editor-toolbar">
    <div className="shown-values">
      {/* The group's own label names it for screen readers */}
      <span aria-hidden>Show…</span>
      <ButtonGroup aria-label="Show">
        {(["names", "values"] as const).map(option => {
          const active = option === shownValues;
          return <Button
            key={option}
            variant={active ? "primary" : "secondary"}
            active={active}
            aria-pressed={active}
            onClick={() => setShownValues(option)}
          >
            {shownValuesLabels[option]}
          </Button>
        })}
      </ButtonGroup>
    </div>
    <div className="editor-actions">
      {/* As in the settings */}
      {!isDefault && <Button variant="outline-warning" className="reset" onClick={onReset}>Reset to default</Button>}
      <Button variant="secondary" className="cancel" onClick={onCancel}>Cancel</Button>
      <Button className="save" onClick={onSave}>Save</Button>
    </div>
  </div>;

  return <>
    <LineLayoutEditor<SceneInfoLayoutEntry>
      className={cx("scene-info-editor", { "showing-values": showValues })}
      layout={layout}
      onChange={onChange}
      getKey={entryKey}
      getAvailable={fieldsNotInLayout}
      // A repeatable field stays among the unused fields: what's added is a new instance of it
      take={entry => typeof entry === "string" && isRepeatableField(entry) ? newFieldInstance(entry) : entry}
      renderItem={(entry, { rightAligned }) => (
        <PillContent field={entry} scene={scene} fieldOptions={optionsFor(entry)} showValues={showValues} rightAligned={rightAligned} />
      )}
      renderItemActions={(entry, { area, onTap }) => {
        if (!hasFieldOptions(entryField(entry))) return null;
        // An unused repeatable field isn't an instance, so it has no options of its own: each one added has its own
        if (area === "available" && typeof entry === "string" && isRepeatableField(entry)) return null;
        return <Button
          className="item-button field-options"
          aria-label={`${nameOf(entry)} options`}
          onClick={onTap(() => setOptionsEntry(entry))}
        >
          <GearFill />
        </Button>;
      }}
      itemLabel={nameOf}
      itemProps={entry => ({
        className: cx("field-pill", {
          unknown: !isKnownField(entryField(entry)), "spacer-pill": entryField(entry) === "spacer",
        }),
        "data-field": entryField(entry),
        // Morphs from and into the field in the panel, switching to and from the editor
        "data-morph-key": entryKey(entry),
      })}
      // Fades in and out, switching to and from the editor, as its pills morph from and into the panel's fields
      rootAttributes={{ "data-morph-key": "editor" }}
      toolbar={toolbar}
      // There's always one: the spacer, which can be added any number of times
      availableHint="Drag the fields you want to show into the section above"
      emptyHint="No fields shown. Drag some up from below."
      availableBeside={orientation === "landscape"}
    />
    {optionsEntry && (() => {
      const field = entryField(optionsEntry);
      if (!hasFieldOptions(field)) return null;
      return <SceneInfoFieldOptionsModal
        field={field}
        options={optionsFor(optionsEntry)[field]}
        onClose={() => setOptionsEntry(null)}
        onSave={options => {
          // An instance's options are its own, in the layout
          if (typeof optionsEntry === "string") onFieldOptionsChange(field, options);
          else onChange(replaceItem(layout, entryKey, entryKey(optionsEntry), { ...optionsEntry, options: { ...options } }));
          setOptionsEntry(null);
        }}
      />;
    })()}
  </>;
}

/** A pill's name or, with `showValues`, the field's value for this scene. `entry` is the field's entry in the layout. */
function PillContent({ field: entry, scene, fieldOptions, showValues, rightAligned }: {
  field: SceneInfoLayoutEntry, scene: GQL.SceneDataFragment, fieldOptions: SceneInfoFieldOptions, showValues: boolean,
  rightAligned?: boolean,
}) {
  const field = entryField(entry);
  // A repeatable field among the unused fields isn't an instance, so it has no value (e.g. a spacer's size) to show
  const isUnusedRepeatable = typeof entry === "string" && isRepeatableField(field);
  if (!isKnownField(field) || !showValues || isUnusedRepeatable) {
    return <span className="pill-name">{entryLabel(entry, fieldOptions)}</span>;
  }
  return <span className="pill-value" data-empty-label={noValueLabel(field)}>
    {/* Empty when the scene has no value for the field, which the CSS fills in with the field's name */}
    <SceneInfoField field={field} scene={scene} fieldOptions={fieldOptions} rightAligned={rightAligned} preview />
  </span>;
}
