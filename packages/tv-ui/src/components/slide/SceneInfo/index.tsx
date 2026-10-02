import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import "./SceneInfo.css"
import React, { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import cx from "classnames";
import { Button } from "react-bootstrap";
import { Pencil } from "react-bootstrap-icons";
import { useTvConfig } from "../../../store/tvConfig";
import { useGlobalState } from "../../../store/globalState";
import { SceneInfoField } from "./fields";
import {
  defaultSceneInfoFieldOptions,
  entryField,
  entryKey,
  isKnownField,
  lineSides,
  resolveFieldOptions,
  SceneInfoFieldOptions,
  SceneInfoFieldOptionsConfig,
  SceneInfoLayout,
  SceneInfoLayoutEntry,
} from "./scene-info-config";
import { SceneInfoEditor } from "./SceneInfoEditor";

export type Props = {
  style?: React.CSSProperties;
  scene: GQL.SceneDataFragment;
  open: boolean;
  className?: string;
  onExternalLinkClick?: () => void;
}

const SceneInfo = forwardRef(({scene, open, className, style, onExternalLinkClick}: Props, ref: React.ForwardedRef<HTMLDivElement>) => {
    const { sceneInfoLayout, sceneInfoFieldOptions, set: setTvConfig, getDefault: getTvConfigDefault } = useTvConfig();
    // The layout and field options being edited, which are only saved when the user chooses to. It's global state so
    // editing carries on if the feed moves to another slide (e.g. when a video ends). Every rendered slide's panel shows
    // it, so the next slide's is already the editor as it scrolls into view.
    const { sceneInfoDraft: draft, set: setGlobalState } = useGlobalState();
    const setDraft = (newDraft: typeof draft) => setGlobalState("sceneInfoDraft", newDraft);
    const editing = draft !== null;
    const fieldOptions = useMemo(() => resolveFieldOptions(sceneInfoFieldOptions), [sceneInfoFieldOptions]);
    const draftFieldOptions = useMemo(() => draft && resolveFieldOptions(draft.fieldOptions), [draft?.fieldOptions]);

    // Closing the panel cancels editing, so it opens showing the scene's info again
    useEffect(() => {
      if (!open) setGlobalState("sceneInfoDraft", null);
    }, [open]);

    return (
      <div
        className={cx("SceneInfo", "hide-on-ui-hide", {active: open, editing}, className)}
        data-testid="MediaSlide--sceneInfo"
        style={style}
        ref={ref}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {/*
          The panel's background, on its own so framer-motion can animate it to the panel's new size (stretching a
          background doesn't distort anything), in step with the editor's contents sliding as the panel grows or shrinks.
          Motion elements only while editing, the only time anything's animated: they measure their layout every time
          they render, which every slide's panel otherwise paid for.
        */}
        {editing ? <motion.div layout className="panel-background" aria-hidden /> : <div className="panel-background" aria-hidden />}
        {/* A motion element (while editing) so the editor's pills, which framer-motion animates, allow for it scrolling */}
        <PanelContent editing={editing}>
        {draft && draftFieldOptions
          ? <SceneInfoEditor
            scene={scene}
            layout={draft.layout}
            onChange={layout => setDraft({ ...draft, layout })}
            fieldOptionsConfig={draft.fieldOptions}
            onFieldOptionsChange={(field, options) => setDraft({ ...draft, fieldOptions: { ...draft.fieldOptions, [field]: { ...options } } })}
            onReset={() => setDraft({ layout: getTvConfigDefault("sceneInfoLayout"), fieldOptions: getTvConfigDefault("sceneInfoFieldOptions") })}
            isDefault={
              JSON.stringify(draft.layout) === JSON.stringify(getTvConfigDefault("sceneInfoLayout"))
              && JSON.stringify(draftFieldOptions) === JSON.stringify(defaultSceneInfoFieldOptions)
            }
            onSave={() => {
              setTvConfig("sceneInfoLayout", draft.layout);
              setTvConfig("sceneInfoFieldOptions", draft.fieldOptions);
              setDraft(null);
            }}
            onCancel={() => setDraft(null)}
          />
          : <>
            <Button
              variant="link"
              className="edit-toggle"
              onClick={() => setDraft({ layout: sceneInfoLayout, fieldOptions: sceneInfoFieldOptions })}
              aria-label="Customise info panel"
              title="Customise info panel"
            >
              <Pencil />
            </Button>
            <FieldLines
              layout={sceneInfoLayout}
              scene={scene}
              fieldOptionsConfig={sceneInfoFieldOptions}
              fieldOptions={fieldOptions}
              onExternalLinkClick={onExternalLinkClick}
            />
          </>
        }
        </PanelContent>
      </div>
    );
  }
);

export default SceneInfo

const spacerSizes = ["small", "medium", "big"] as const;

/**
 * Spacers on lines of their own with nothing shown between them (the lines between have no values for the scene) would
 * add up to a bigger space than any of them: they're collapsed to the biggest of them (the first of the biggest). With
 * nothing shown before them, or after them, they'd be space at the panel's top or bottom, so they all collapse. Worked
 * out from what's been rendered, as whether a field shows anything is up to the field.
 */
function collapseSpacers(lines: HTMLElement) {
  let run: { line: Element, size: number }[] = [];
  let shownBefore = false;
  /** Collapse the run of spacers so far, but for the biggest of them if `keepOne` */
  const collapseRun = (keepOne: boolean) => {
    const biggest = keepOne ? run.reduce((best, spacer) => spacer.size > best.size ? spacer : best, run[0]) : null;
    for (const { line } of run) line.classList.toggle("collapsed-spacer", line !== biggest?.line);
    run = [];
  };
  for (const line of lines.children) {
    line.classList.remove("collapsed-spacer");
    const fields = [...line.querySelectorAll(":scope > .line-fields > .field")];
    // Shows nothing, so it doesn't come between spacers
    if (!fields.length) continue;
    // Only spacers: space between the lines (see SceneInfo.css)
    if (fields.every(field => field.classList.contains("field-spacer"))) {
      const size = Math.max(...fields.map(field => spacerSizes.findIndex(size => field.classList.contains(`spacer-${size}`))));
      run.push({ line, size });
      continue;
    }
    if (run.length) collapseRun(shownBefore);
    shownBefore = true;
  }
  // Nothing shown after them
  if (run.length) collapseRun(false);
}

/** The panel's fields, on their lines */
function FieldLines({ layout, scene, fieldOptionsConfig, fieldOptions, onExternalLinkClick }: {
  layout: SceneInfoLayout,
  scene: GQL.SceneDataFragment,
  fieldOptionsConfig: SceneInfoFieldOptionsConfig,
  fieldOptions: SceneInfoFieldOptions,
  onExternalLinkClick?: () => void,
}) {
  const ref = useRef<HTMLDivElement>(null);
  // After every render, as any of them can change which fields show anything (e.g. the scene's details being cleared)
  useLayoutEffect(() => {
    if (ref.current) collapseSpacers(ref.current);
  });
  return <div className="field-lines" ref={ref}>
    {layout.map((line, lineIndex) => {
      const { left, right } = lineSides(line);
      const fields = (entries: SceneInfoLayoutEntry[], rightAligned: boolean) => entries.map(entry => {
        const field = entryField(entry);
        if (!isKnownField(field)) return null;
        return <SceneInfoField
          key={entryKey(entry)}
          field={field}
          scene={scene}
          // An instance of a repeatable field (e.g. a spacer) has its own
          fieldOptions={typeof entry === "string" ? fieldOptions : resolveFieldOptions(fieldOptionsConfig, entry)}
          rightAligned={rightAligned}
          onExternalLinkClick={onExternalLinkClick}
        />;
      });
      // Each side in a box wrapping on its own
      return <div className="field-line" key={lineIndex}>
        <div className="line-fields">{fields(left, false)}</div>
        {right.length > 0 && <div className="line-fields right-aligned-fields">{fields(right, true)}</div>}
      </div>;
    })}
  </div>;
}

/**
 * The panel's contents, which scroll if they're taller than the panel can be. While editing, only then do they clip
 * what's outside them: otherwise, as the panel shrinks, what's at its top slides down from outside it (where it was),
 * clipped. Not editing, nothing slides, so they can always scroll, and every slide's panel needn't measure itself.
 */
function PanelContent({ editing, children }: { editing: boolean, children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const content = ref.current;
    if (!editing || !content) return;
    const measure = () => setOverflowing(content.scrollHeight > content.clientHeight + 1);
    measure();
    // The content (its size limited by the panel's) and what's in it (the editor, growing and shrinking)
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    for (const child of content.children) observer.observe(child);
    return () => observer.disconnect();
  }, [editing]);
  const className = cx("panel-content", { scrollable: !editing || overflowing });
  return editing
    ? <motion.div layoutScroll ref={ref} className={className}>{children}</motion.div>
    : <div ref={ref} className={className}>{children}</div>;
}
