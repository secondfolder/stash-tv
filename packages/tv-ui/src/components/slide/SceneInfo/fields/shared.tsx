import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import React, { ReactNode } from "react";
import cx from "classnames";
import type { LabelOption, LabelStyle, OptionsOf, OptionsSchema } from "../field-options";

/** What a field's component is given: the scene, and the field's own options (see `SceneInfoFieldDefinition`) */
export type SceneInfoFieldProps<Options = OptionsOf<Record<never, never>>> = {
  scene: GQL.SceneDataFragment;
  /** How the field is shown, if it can be shown more than one way: its options, or an instance's own */
  options: Options;
  /**
   * Shown in one of the editor's pills to identify the field rather than in the panel, so it isn't interactive: e.g. the
   * rating's stars are disabled, and capped text isn't expandable
   */
  preview?: boolean;
  /** Whether it's one of its line's right-aligned fields */
  rightAligned?: boolean;
  onExternalLinkClick?: () => void;
};

/**
 * One of the fields the panel can show, defined in a file of its own in this folder and listed in `sceneInfoFields`
 * (fields/index.tsx), which everything else about the fields (their ids, names, options…) comes from. See
 * docs/scene-info-panel.md § "Fields".
 */
export type SceneInfoFieldDefinition<Id extends string = string, Schema extends OptionsSchema = OptionsSchema> = {
  id: Id;
  /** Names the field in the editor, and labels its value where that doesn't explain itself */
  label: string;
  /** Renders the field's value, or nothing (`null`) if the scene doesn't have one */
  component: React.FC<SceneInfoFieldProps<OptionsOf<Schema>>>;
  /** Its options, if it can be shown more than one way (see field-options.tsx) */
  options?: Schema;
  /**
   * Whether it can be in the layout more than once, each an instance with options of its own. It's always among the
   * unused fields, adding one adding another instance of it.
   */
  repeatable?: boolean;
  /** What an instance of a repeatable field is called in the editor, from its options (e.g. "Big spacer") */
  instanceLabel?: (options: OptionsOf<Schema>) => string;
};

/**
 * Defines a field (see `SceneInfoFieldDefinition`), checking its component takes its options. Its options' schema is
 * declared before its component, which is typed with it: `SceneInfoFieldProps<OptionsOf<typeof options>>`.
 */
export function defineField<const Id extends string, Schema extends OptionsSchema = Record<never, never>>(
  definition: SceneInfoFieldDefinition<Id, Schema>,
): SceneInfoFieldDefinition<Id, Schema> {
  return definition;
}

export const getStashUrl = (path: string) => {
  if (!import.meta.env.STASH_ADDRESS) return path;
  const url = new URL(path, import.meta.env.STASH_ADDRESS);
  return url.toString();
}

/**
 * A field's container. `showLabel` shows the field's name before the value, for values that don't explain themselves,
 * and `icon` an icon standing in for it.
 */
export function Field({ field, showLabel, icon, className, children }: {
  field: { id: string, label: string }, showLabel?: boolean, icon?: ReactNode, className?: string, children: ReactNode,
}) {
  return <div className={cx("field", `field-${field.id}`, className)}>
    {showLabel && <span className="field-label">{field.label}</span>}
    {icon && <span className="field-icon" role="img" aria-label={field.label} title={field.label}>
      {icon}
    </span>}
    {children}
  </div>
}

/**
 * The props labelling a field's value as its "Label" option (`labelOption`) says (`style`): with its name, with its
 * icon (`active` if it has a value), or not at all
 */
export function labelProps(labelOption: Pick<LabelOption, "icons">, style: LabelStyle, active: boolean) {
  if (style === "none") return {};
  if (style === "text") return { showLabel: true };
  const Icon = labelOption.icons[active ? "active" : "inactive"];
  return { icon: <Icon aria-hidden /> };
}

/** Joins items into a sentence, e.g. "A and B" or "A, B, and C" */
export function joinAsSentence(items: ReactNode[]) {
  return items.map((item, i) => {
    let suffix = null;
    if (items.length === 2 && i === 0) suffix = " and ";
    else if (i === items.length - 2) suffix = ", and ";
    else if (i < items.length - 2) suffix = ", ";
    return <React.Fragment key={i}>{item}{suffix}</React.Fragment>;
  });
}
