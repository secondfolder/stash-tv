import React, { useLayoutEffect, useRef, useState } from "react";
import cx from "classnames";
import { OptionsOf, toggle } from "../field-options";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

const schema = {
  /** Whether the details are always shown in full, rather than cut short until clicked */
  showFullText: toggle(false, {
    label: "Always show the full text",
    description: "Otherwise the details are cut short after 3 lines. Click them to show the rest.",
  }),
};

/** How many lines of the details are shown until they're clicked, unless they're always shown in full */
const detailsLineCount = 3;

function DetailsField({ scene, options, preview }: SceneInfoFieldProps<OptionsOf<typeof schema>>) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const capped = !options.showFullText && !expanded;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!capped || !element) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [capped, scene.details]);
  if (!scene.details) return null;
  // Expandable only if it doesn't all fit, and collapsible again once expanded
  const toggleable = !preview && (expanded || overflowing);
  return <Field field={fieldDefinition} className={cx({ capped, toggleable })}>
    <div
      ref={ref}
      className="details-text"
      style={capped ? { WebkitLineClamp: detailsLineCount } : undefined}
      role={toggleable ? "button" : undefined}
      tabIndex={toggleable ? 0 : undefined}
      aria-expanded={toggleable ? expanded : undefined}
      onClick={toggleable ? () => setExpanded(!expanded) : undefined}
      onKeyDown={toggleable ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setExpanded(!expanded);
      } : undefined}
    >
      {scene.details}
    </div>
  </Field>
}

export const fieldDefinition = defineField({ id: "details", label: "Details", component: DetailsField, options: schema });
