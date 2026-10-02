import React from "react";
import type { OptionsOf } from "../field-options";
import { SceneInfoFieldDefinition, SceneInfoFieldProps } from "./shared";
import { fieldDefinition as studio } from "./studio";
import { fieldDefinition as title } from "./title";
import { fieldDefinition as performers } from "./performers";
import { fieldDefinition as date } from "./date";
import { fieldDefinition as details } from "./details";
import { fieldDefinition as tags } from "./tags";
import { fieldDefinition as groups } from "./groups";
import { fieldDefinition as code } from "./code";
import { fieldDefinition as director } from "./director";
import { fieldDefinition as rating } from "./rating";
import { fieldDefinition as duration } from "./duration";
import { fieldDefinition as resolution } from "./resolution";
import { fieldDefinition as frameRate } from "./frame-rate";
import { fieldDefinition as playCount } from "./play-count";
import { fieldDefinition as oCount } from "./o-count";
import { fieldDefinition as path } from "./path";
import { fieldDefinition as urls } from "./urls";
import { fieldDefinition as spacer } from "./spacer";

/**
 * Every field the scene info panel can show, in their usual order (e.g. among the unused fields in the editor). Each is
 * defined in a file of its own (see `SceneInfoFieldDefinition`), and everything else about the fields comes from here.
 */
export const sceneInfoFields = [
  studio,
  title,
  performers,
  date,
  details,
  tags,
  groups,
  code,
  director,
  rating,
  duration,
  resolution,
  frameRate,
  playCount,
  oCount,
  path,
  urls,
  spacer,
] as const;

type Definition = typeof sceneInfoFields[number];

export type SceneInfoFieldId = Definition["id"];

export const sceneInfoFieldIds: readonly SceneInfoFieldId[] = sceneInfoFields.map(field => field.id);

const fieldsById = Object.fromEntries(sceneInfoFields.map(field => [field.id, field])) as {
  [D in Definition as D["id"]]: D
};

/** Names each field in the panel's editor, and labels the values that don't explain themselves */
export const sceneInfoFieldLabels = Object.fromEntries(sceneInfoFields.map(field => [field.id, field.label])) as Record<SceneInfoFieldId, string>;

type SchemaOf<D> = D extends SceneInfoFieldDefinition<string, infer Schema> ? Schema : never;

/** The options of each field that can be shown more than one way */
type OptionSchemas = { [D in Definition as keyof SchemaOf<D> extends never ? never : D["id"]]: SchemaOf<D> };

export const sceneInfoFieldOptionSchemas = Object.fromEntries(
  sceneInfoFields.flatMap(field => "options" in field && field.options ? [[field.id, field.options]] : []),
) as OptionSchemas;

export type SceneInfoFieldWithOptions = keyof OptionSchemas;

/** How the fields that can be shown more than one way are shown */
export type SceneInfoFieldOptions = { [F in SceneInfoFieldWithOptions]: OptionsOf<OptionSchemas[F]> };

export function isKnownField(field: string): field is SceneInfoFieldId {
  return Object.hasOwn(fieldsById, field);
}

/** The field's definition, if it's one this version knows */
export function fieldDefinition(field: string): SceneInfoFieldDefinition | undefined {
  return isKnownField(field) ? fieldsById[field] as SceneInfoFieldDefinition : undefined;
}

/** Renders one of the panel's fields, given every field's options (an instance's own for an instance), or nothing if the scene doesn't have a value for it */
export function SceneInfoField({ field, fieldOptions, ...props }: Omit<SceneInfoFieldProps, "options"> & {
  field: SceneInfoFieldId;
  fieldOptions: SceneInfoFieldOptions;
}) {
  const Component = fieldsById[field].component as React.FC<SceneInfoFieldProps<unknown>>;
  return <Component {...props} options={(fieldOptions as Record<string, unknown>)[field] ?? {}} />;
}
