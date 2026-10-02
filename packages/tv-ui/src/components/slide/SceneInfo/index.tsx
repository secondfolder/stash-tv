import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import "./SceneInfo.css"
import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import cx from "classnames";
import { Button } from "react-bootstrap";
import { Pencil } from "react-bootstrap-icons";
import { useTvConfig } from "../../../store/tvConfig";
import { useGlobalState } from "../../../store/globalState";
import { SceneInfoField } from "./fields";
import { isKnownField, SceneInfoLayout } from "./scene-info-config";
import { SceneInfoEditor } from "./SceneInfoEditor";

export type Props = {
  style?: React.CSSProperties;
  scene: GQL.SceneDataFragment;
  open: boolean;
  className?: string;
  onExternalLinkClick?: () => void;
}

const SceneInfo = forwardRef(({scene, open, className, style, onExternalLinkClick}: Props, ref: React.ForwardedRef<HTMLDivElement>) => {
    const { sceneInfoLayout, set: setTvConfig, getDefault: getTvConfigDefault } = useTvConfig();
    // The layout being edited, which is only saved when the user chooses to. It's global state so editing carries on
    // if the feed moves to another slide (e.g. when a video ends). Every rendered slide's panel shows it, so the next
    // slide's is already the editor as it scrolls into view.
    const { sceneInfoDraftLayout: draftLayout, set: setGlobalState } = useGlobalState();
    const setDraftLayout = (layout: SceneInfoLayout | null) => setGlobalState("sceneInfoDraftLayout", layout);
    const editing = draftLayout !== null;

    // Closing the panel cancels editing, so it opens showing the scene's info again
    useEffect(() => {
      if (!open) setGlobalState("sceneInfoDraftLayout", null);
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
        {draftLayout
          ? <SceneInfoEditor
            scene={scene}
            layout={draftLayout}
            onChange={setDraftLayout}
            onReset={() => setDraftLayout(getTvConfigDefault("sceneInfoLayout"))}
            isDefault={JSON.stringify(draftLayout) === JSON.stringify(getTvConfigDefault("sceneInfoLayout"))}
            onSave={() => {
              setTvConfig("sceneInfoLayout", draftLayout);
              setDraftLayout(null);
            }}
            onCancel={() => setDraftLayout(null)}
          />
          : <>
            <Button
              variant="link"
              className="edit-toggle"
              onClick={() => setDraftLayout(sceneInfoLayout)}
              aria-label="Customise info panel"
              title="Customise info panel"
            >
              <Pencil />
            </Button>
            {sceneInfoLayout.map((line, lineIndex) => (
              <div className="field-line" key={lineIndex}>
                {line.filter(isKnownField).map(field => (
                  <SceneInfoField key={field} field={field} scene={scene} onExternalLinkClick={onExternalLinkClick} />
                ))}
              </div>
            ))}
          </>
        }
        </PanelContent>
      </div>
    );
  }
);

export default SceneInfo

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
