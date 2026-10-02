import { generateConfigId } from "../../../helpers/config-ids";
import { Layout, Line, lineItems } from "../../LineLayoutEditor/line-layout";

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

export const spacerSizeLabels: Record<SceneInfoFieldOptions["spacer"]["size"], string> = {
  small: "Small",
  medium: "Medium",
  big: "Big",
};

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

/** How the fields that can be shown more than one way are shown, chosen in the editor with each field's options button */
export type SceneInfoFieldOptions = {
  /** As Stash's rating stars (or number), which set the rating, or as text */
  rating: { display: "control" | "text" };
  /**
   * As a button marking an orgasm, like the o-counter action button, or as text. As text, labelled with the o-counter
   * icon or the field's name (`label`).
   */
  "o-count": { display: "control" | "text"; label: SceneInfoFieldLabelStyle };
  /** Labelled with a person icon or the field's name, or not labelled */
  performers: { label: SceneInfoFieldLabelStyle | "none" };
  /** Labelled with an eye icon (an outline until the scene's been played) or the field's name */
  "play-count": { label: SceneInfoFieldLabelStyle };
  /** Whether the details are always shown in full, rather than capped at 3 lines until clicked */
  details: { showFullText: boolean };
  /** Whether every tag is always shown, rather than capped at 3 rows until "Show more" is clicked */
  tags: { showAll: boolean };
  /** Space between fields, beside them on a line, or above and below on a line of its own */
  spacer: { size: "small" | "medium" | "big" };
  /** Shown as e.g. "1080p" (`name`) or "1920×1080" (`dimensions`), unlabelled or labelled with an icon or its name */
  resolution: { format: "name" | "dimensions"; label: SceneInfoFieldLabelStyle | "none" };
};

/** How a field's value is labelled: with an icon, or with the field's name */
export type SceneInfoFieldLabelStyle = "icon" | "text";

export type SceneInfoFieldWithOptions = keyof SceneInfoFieldOptions;

export const defaultSceneInfoFieldOptions: SceneInfoFieldOptions = {
  rating: { display: "control" },
  "o-count": { display: "control", label: "icon" },
  "play-count": { label: "icon" },
  performers: { label: "icon" },
  details: { showFullText: false },
  tags: { showAll: false },
  resolution: { format: "name", label: "none" },
  spacer: { size: "medium" },
};

/**
 * `tvConfig.sceneInfoFieldOptions`: each field's options that have been set, by field. Loosely typed because it comes
 * from persisted user settings, which may have been saved by another version of Stash TV. `resolveFieldOptions` reads
 * it.
 */
export type SceneInfoFieldOptionsConfig = Record<string, Record<string, unknown> | undefined>;

export function hasFieldOptions(field: string): field is SceneInfoFieldWithOptions {
  return Object.hasOwn(defaultSceneInfoFieldOptions, field);
}

/**
 * Every field's options: those set in `config`, and the defaults for the rest. A value of the wrong type (e.g. an option
 * whose choices have since changed) is replaced by the default, and options this version doesn't know are dropped.
 * With `entry`, an instance of a repeatable field, that field's options are the instance's own.
 */
export function resolveFieldOptions(config: SceneInfoFieldOptionsConfig | undefined, entry?: SceneInfoLayoutEntry): SceneInfoFieldOptions {
  const instance = entry !== undefined && typeof entry !== "string" ? entry : null;
  const resolved: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(defaultSceneInfoFieldOptions).map(([field, defaults]) => [field, { ...defaults }]),
  );
  for (const [field, defaults] of Object.entries(resolved)) {
    const set = instance && field === entryField(instance) ? instance.options : config?.[field];
    if (!set || typeof set !== "object") continue;
    for (const [option, defaultValue] of Object.entries(defaults)) {
      const value = set[option];
      if (value !== undefined && typeof value === typeof defaultValue && isAllowedValue(field, option, value)) {
        defaults[option] = value;
      }
    }
  }
  return resolved as SceneInfoFieldOptions;
}

/** The values a field's options can take, for those that are a choice between strings */
export const sceneInfoFieldOptionChoices: { [F in SceneInfoFieldWithOptions]?: { [O in keyof SceneInfoFieldOptions[F]]?: readonly SceneInfoFieldOptions[F][O][] } } = {
  rating: { display: ["control", "text"] },
  "o-count": { display: ["control", "text"], label: ["icon", "text"] },
  "play-count": { label: ["icon", "text"] },
  performers: { label: ["none", "icon", "text"] },
  resolution: { format: ["name", "dimensions"], label: ["none", "icon", "text"] },
  spacer: { size: ["small", "medium", "big"] },
};

function isAllowedValue(field: string, option: string, value: unknown) {
  const choices = (sceneInfoFieldOptionChoices as Record<string, Record<string, readonly unknown[]> | undefined>)[field]?.[option];
  return !choices || choices.includes(value);
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
