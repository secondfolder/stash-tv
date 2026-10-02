import { generateConfigId } from "../../../helpers/config-ids";
import { Layout, Line, lineItems } from "../../LineLayoutEditor/line-layout";
import { Eye, EyeFill, Person, PersonFill } from "react-bootstrap-icons";
import ResolutionIcon from "../../../assets/resolution.svg?react";
import { oCounterIcons } from "../../OCounterControls";
import {
  choice,
  defaultOptions,
  labelOption,
  LabelIcons,
  LabelOption,
  OptionsOf,
  OptionsSchema,
  resolveOptions,
  toggle,
} from "./field-options";

/** Every field the scene info panel can show */
export const sceneInfoFieldIds = [
  "studio",
  "title",
  "performers",
  "date",
  "details",
  "tags",
  "groups",
  "code",
  "director",
  "rating",
  "duration",
  "resolution",
  "frame-rate",
  "play-count",
  "o-count",
  "path",
  "urls",
  "spacer",
] as const;

export type SceneInfoFieldId = typeof sceneInfoFieldIds[number];

/** Names each field in the panel's editor, and labels the values that don't explain themselves */
export const sceneInfoFieldLabels: Record<SceneInfoFieldId, string> = {
  studio: "Studio",
  title: "Title",
  performers: "Performers",
  date: "Date",
  details: "Details",
  tags: "Tags",
  groups: "Groups",
  code: "Studio code",
  director: "Director",
  rating: "Rating",
  duration: "Duration",
  resolution: "Resolution",
  "frame-rate": "Frame rate",
  "play-count": "Play count",
  "o-count": "O-count",
  path: "File path",
  urls: "URLs",
  spacer: "Spacer",
};

/**
 * Fields that can be in the layout more than once. Each one there is an instance of its own (`SceneInfoFieldInstance`),
 * with its own options. They're always among the unused fields, and adding one from there adds another instance,
 * leaving it there.
 */
const repeatableFields: readonly SceneInfoFieldId[] = ["spacer"];

export function isRepeatableField(field: string): boolean {
  return (repeatableFields as readonly string[]).includes(field);
}

/**
 * One of a repeatable field's instances in the layout: the field, its own options, and an id telling it apart from the
 * field's other instances (which can be just the same), to keep track of it as it's moved about.
 */
export type SceneInfoFieldInstance = { field: string; id: string; options?: Record<string, unknown> };

/** One of a line's fields: a field's id, or one of a repeatable field's instances */
export type SceneInfoLayoutEntry = string | SceneInfoFieldInstance;

/** A new instance of a repeatable field, with its default options */
export function newFieldInstance(field: string): SceneInfoFieldInstance {
  return { field, id: generateConfigId() };
}

/** The field an entry in the layout is. An instance saved broken (it's from persisted settings) is an unknown field. */
export function entryField(entry: SceneInfoLayoutEntry): string {
  if (typeof entry === "string") return entry;
  return typeof entry?.field === "string" ? entry.field : "";
}

/** What tells an entry apart from the layout's others: its field, or an instance's field and id */
export function entryKey(entry: SceneInfoLayoutEntry): string {
  return typeof entry === "string" ? entry : `${entryField(entry)}:${String(entry?.id)}`;
}

/**
 * What an entry's called in the editor: its field's name, or for some repeatable fields, a name from its options (e.g.
 * "Big spacer"), so their instances can be told apart. Unknown fields are "Unknown field".
 */
export function entryLabel(entry: SceneInfoLayoutEntry, options: SceneInfoFieldOptions): string {
  const field = entryField(entry);
  if (!isKnownField(field)) return "Unknown field";
  if (typeof entry !== "string" && field === "spacer") return `${spacerSizeLabels[options.spacer.size]} spacer`;
  return sceneInfoFieldLabels[field];
}

/**
 * What a field with no value for the scene shows in the editor, e.g. "No studio code", in sentence case. Only a first
 * word that's simply capitalised is lowercased, so names like "URLs" and "O-count" keep their capitals.
 */
export function noValueLabel(field: SceneInfoFieldId): string {
  return `No ${sceneInfoFieldLabels[field].replace(/^[A-Z][a-z]+\b/, word => word.toLowerCase())}`;
}

/**
 * One of the panel's lines: the fields on it from left to right or, when some are right-aligned, the fields on its left
 * and those on its right (each from left to right). Fields are plain strings (or instances naming their field) because
 * the config comes from persisted user settings and may name a field this version doesn't know (e.g. saved by a newer
 * Stash TV). Those are kept where they are, but not shown.
 */
export type SceneInfoLine = Line<SceneInfoLayoutEntry>;

/** `tvConfig.sceneInfoLayout`: the panel's lines, top to bottom, as LineLayoutEditor edits them */
export type SceneInfoLayout = Layout<SceneInfoLayoutEntry>;

/** What the editor's pills show: each field's name, or its value for the scene */
export type SceneInfoEditorPillContent = "names" | "values";

export const spacerSizeLabels = {
  small: "Small",
  medium: "Medium",
  big: "Big",
} as const;

/**
 * The options of the fields that can be shown more than one way, chosen in the editor with each field's options button.
 * Their types, defaults, validation and the options dialog's controls all come from this (see field-options.tsx).
 */
export const sceneInfoFieldOptionSchemas = {
  rating: {
    /** As Stash's rating stars (or number), which set the rating, or as text */
    display: choice({ control: "Rating control", text: "Text" }, "control", {
      label: "Show as",
      description: "The rating control sets the scene's rating, and shows even when it has none.",
    }),
  },
  "o-count": {
    /** As a button marking an orgasm, like the o-counter action button, or as text */
    display: choice({ control: "O-counter button", text: "Text" }, "control", {
      label: "Show as",
      description: "The button marks an orgasm, like the O-counter action button, and shows even when the O-count is 0.",
    }),
    /** As text, labelled with the o-counter icon or the field's name */
    label: labelOption({ name: "O-count", icons: oCounterIcons, default: "icon", shown: options => options.display === "text" }),
  },
  performers: {
    label: labelOption({ name: "Performers", icons: { active: PersonFill, inactive: Person }, allowNone: true, default: "icon" }),
  },
  "play-count": {
    /** Labelled with an eye icon (an outline until the scene's been played) or the field's name */
    label: labelOption({
      name: "Play count",
      icons: { active: EyeFill, inactive: Eye },
      default: "icon",
      description: "With the icon, it shows before the scene's been played too, the icon an outline until it has.",
    }),
  },
  details: {
    /** Whether the details are always shown in full, rather than cut short until clicked */
    showFullText: toggle(false, {
      label: "Always show the full text",
      description: "Otherwise the details are cut short after 3 lines. Click them to show the rest.",
    }),
  },
  tags: {
    /** Whether every tag is always shown, rather than cut short until "Show N more" is clicked */
    showAll: toggle(false, {
      label: "Always show every tag",
      description: "Otherwise only 2 rows of tags are shown, with a button below them showing the rest.",
    }),
  },
  spacer: {
    /** Space between fields, beside them on a line, or above and below on a line of its own */
    size: choice(spacerSizeLabels, "medium", {
      label: "Size",
      description: "Alone on its line, it's space between lines. Beside other fields, it's space between them.",
    }),
  },
  resolution: {
    /** Shown as e.g. "1080p" (`name`) or "1920×1080" (`dimensions`) */
    format: choice({ name: "Name (e.g. 1080p)", dimensions: "Width × height (e.g. 1920×1080)" }, "name", { label: "Show as" }),
    label: labelOption({ name: "Resolution", icons: { active: ResolutionIcon, inactive: ResolutionIcon }, allowNone: true, default: "none" }),
  },
} satisfies Partial<Record<SceneInfoFieldId, OptionsSchema>>;

export type SceneInfoFieldWithOptions = keyof typeof sceneInfoFieldOptionSchemas;

/** How the fields that can be shown more than one way are shown */
export type SceneInfoFieldOptions = {
  [F in SceneInfoFieldWithOptions]: OptionsOf<typeof sceneInfoFieldOptionSchemas[F]>
};

export const defaultSceneInfoFieldOptions = Object.fromEntries(
  Object.entries(sceneInfoFieldOptionSchemas).map(([field, schema]) => [field, defaultOptions(schema)]),
) as SceneInfoFieldOptions;

/**
 * `tvConfig.sceneInfoFieldOptions`: each field's options that have been set, by field. Loosely typed because it comes
 * from persisted user settings, which may have been saved by another version of Stash TV. `resolveFieldOptions` reads
 * it.
 */
export type SceneInfoFieldOptionsConfig = Record<string, Record<string, unknown> | undefined>;

export function hasFieldOptions(field: string): field is SceneInfoFieldWithOptions {
  return Object.hasOwn(sceneInfoFieldOptionSchemas, field);
}

/** The icons a field's value can be labelled with, if it has a "Label" option */
export function fieldLabelIcons(field: SceneInfoFieldWithOptions): LabelIcons | undefined {
  const label = (sceneInfoFieldOptionSchemas[field] as OptionsSchema).label;
  return label && "icons" in label ? (label as LabelOption).icons : undefined;
}

/**
 * Every field's options: those set in `config`, and the defaults for the rest. A value an option can't take (e.g. a
 * choice since removed) is replaced by the default, and options this version doesn't know are dropped. With `entry`,
 * an instance of a repeatable field, that field's options are the instance's own.
 */
export function resolveFieldOptions(config: SceneInfoFieldOptionsConfig | undefined, entry?: SceneInfoLayoutEntry): SceneInfoFieldOptions {
  const instance = entry !== undefined && typeof entry !== "string" ? entry : null;
  return Object.fromEntries(Object.entries(sceneInfoFieldOptionSchemas).map(([field, schema]) => {
    const set = instance && field === entryField(instance) ? instance.options : config?.[field];
    return [field, resolveOptions(schema, set && typeof set === "object" ? set : undefined)];
  })) as SceneInfoFieldOptions;
}

/** A spacer in the default layout. Its id need only be unique in the layout. */
function defaultSpacer(id: number, size: SceneInfoFieldOptions["spacer"]["size"]): SceneInfoFieldInstance {
  return { field: "spacer", id: `default-${id}`, options: { size } };
}

export const defaultSceneInfoLayout: SceneInfoLayout = [
  ["studio"],
  ["title"],
  [defaultSpacer(1, "medium")],
  { left: ["date"], right: ["resolution", defaultSpacer(2, "small"), "frame-rate"] },
  [defaultSpacer(3, "small")],
  { left: ["rating"], right: ["o-count", defaultSpacer(4, "medium"), "play-count"] },
  [defaultSpacer(5, "medium")],
  ["performers"],
  [defaultSpacer(6, "small")],
  ["tags"],
  [defaultSpacer(7, "small")],
  ["details"],
];

export function isKnownField(field: string): field is SceneInfoFieldId {
  return (sceneInfoFieldIds as readonly string[]).includes(field);
}

/** The known fields that aren't in the layout, which can be added to it */
export function fieldsNotInLayout(layout: SceneInfoLayout): SceneInfoFieldId[] {
  return sceneInfoFieldIds.filter(field => (
    isRepeatableField(field) || !layout.some(line => lineItems(line).some(entry => entryField(entry) === field))
  ));
}
