import { generateConfigId } from "../../../helpers/config-ids";
import { Layout, Line, lineItems } from "../../LineLayoutEditor/line-layout";
import { defaultOptions, OptionsOf, OptionsSchema, resolveOptions } from "./field-options";
import {
  fieldDefinition,
  isKnownField,
  sceneInfoFieldIds,
  sceneInfoFieldLabels,
  sceneInfoFieldOptionSchemas,
  type SceneInfoFieldId,
  type SceneInfoFieldOptions,
  type SceneInfoFieldWithOptions,
} from "./fields";

// What's known about the fields comes from their definitions (fields/)
export {
  isKnownField,
  sceneInfoFieldIds,
  sceneInfoFieldLabels,
  sceneInfoFieldOptionSchemas,
  type SceneInfoFieldId,
  type SceneInfoFieldOptions,
  type SceneInfoFieldWithOptions,
};

/**
 * Whether a field can be in the layout more than once. Each one there is an instance of its own
 * (`SceneInfoFieldInstance`), with its own options. It's always among the unused fields, and adding one from there
 * adds another instance, leaving it there.
 */
export function isRepeatableField(field: string): boolean {
  return !!fieldDefinition(field)?.repeatable;
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
 * What an entry's called in the editor: its field's name, or for an instance of a repeatable field with an
 * `instanceLabel`, a name from its options (e.g. "Big spacer"), so its instances can be told apart. Unknown fields are
 * "Unknown field".
 */
export function entryLabel(entry: SceneInfoLayoutEntry, options: SceneInfoFieldOptions): string {
  const field = entryField(entry);
  const definition = fieldDefinition(field);
  if (!definition) return "Unknown field";
  if (typeof entry !== "string" && definition.instanceLabel) {
    return definition.instanceLabel((options as unknown as Record<string, OptionsOf<OptionsSchema>>)[field] ?? {});
  }
  return definition.label;
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

// The default layout is in a module of its own, which imports no components, for the tvConfig store
export { defaultSceneInfoLayout } from "./default-layout";

/** The known fields that aren't in the layout, which can be added to it, in their usual order */
export function fieldsNotInLayout(layout: SceneInfoLayout): SceneInfoFieldId[] {
  return sceneInfoFieldIds.filter(field => (
    isRepeatableField(field) || !layout.some(line => lineItems(line).some(entry => entryField(entry) === field))
  ));
}
