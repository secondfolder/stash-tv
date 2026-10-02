/**
 * Declaring a field's options: each one a choice between values or a toggle, with its default, its label and
 * description in the field's options dialog, and when it's offered. Their types, defaults, validation (of saved
 * settings, and in the dialog) and the dialog's controls are all derived from this. See docs/scene-info-panel.md
 * § "Field options".
 */
import React, { ComponentType, ReactNode, SVGProps } from "react";

/** A choice's button: its text, or something else (e.g. an icon) with a name for screen readers (and as its tooltip) */
export type ChoiceLabel = string | { content: ReactNode; name: string };

type OptionDetails = {
  /** What it's called in the options dialog */
  label: string;
  description?: string;
  /** Whether it's offered, given the field's options as they are in the dialog (e.g. not while it's irrelevant) */
  shown?: (options: Record<string, unknown>) => boolean;
};

export type ChoiceOption<V extends string = string> = OptionDetails & {
  type: "choice";
  choices: Record<V, ChoiceLabel>;
  default: V;
};

export type ToggleOption = OptionDetails & {
  type: "toggle";
  default: boolean;
};

export type OptionSchema = ChoiceOption | ToggleOption;

/** A field's options, by name */
export type OptionsSchema = Record<string, OptionSchema>;

/** The options' values a schema describes */
export type OptionsOf<S extends OptionsSchema> = { [K in keyof S]: S[K] extends ChoiceOption<infer V> ? V : boolean };

/** A choice between values, e.g. `choice({ control: "Rating control", text: "Text" }, "control", { label: "Show as" })` */
export function choice<const V extends string>(choices: Record<V, ChoiceLabel>, defaultValue: NoInfer<V>, details: OptionDetails): ChoiceOption<V> {
  return { type: "choice", choices, default: defaultValue, ...details };
}

/** On or off, shown as a switch */
export function toggle(defaultValue: boolean, details: OptionDetails): ToggleOption {
  return { type: "toggle", default: defaultValue, ...details };
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/** An icon standing in for a field's name, as it is when the field has a value (`active`) and when it doesn't */
export type LabelIcons = { active: IconComponent; inactive: IconComponent };

/** How a field's value is labelled: with an icon, with its name (`text`), or (where offered) not at all */
export type LabelStyle = "icon" | "text" | "none";

export type LabelOption<V extends LabelStyle = LabelStyle> = ChoiceOption<V> & { icons: LabelIcons };

/**
 * The "Label" option of a field whose value doesn't explain itself: labelled with an icon (`icons`), or with its name
 * (`name`), or, with `allowNone`, not at all ("None", in italics as it isn't literally the label, as the others are)
 */
export function labelOption<const AllowNone extends boolean = false>({ name, icons, allowNone, default: defaultValue, ...details }: {
  name: string;
  icons: LabelIcons;
  allowNone?: AllowNone;
  default: AllowNone extends true ? LabelStyle : Exclude<LabelStyle, "none">;
} & Omit<OptionDetails, "label">): LabelOption<AllowNone extends true ? LabelStyle : Exclude<LabelStyle, "none">> {
  const Icon = icons.active;
  const choices: Record<LabelStyle, ChoiceLabel> = {
    none: { content: <em>None</em>, name: "None" },
    icon: { content: <Icon aria-hidden />, name: "Icon" },
    text: name,
  };
  if (!allowNone) delete (choices as Partial<typeof choices>).none;
  // The choices' type follows `allowNone`, which TypeScript can't see `delete` doing
  return { type: "choice", choices, default: defaultValue, label: "Label", icons, ...details } as never;
}

/** The options' defaults */
export function defaultOptions<S extends OptionsSchema>(schema: S): OptionsOf<S> {
  return Object.fromEntries(Object.entries(schema).map(([name, option]) => [name, option.default])) as OptionsOf<S>;
}

/** Whether `value` is one an option can take */
export function isAllowedValue(option: OptionSchema, value: unknown): boolean {
  return option.type === "toggle" ? typeof value === "boolean" : typeof value === "string" && Object.hasOwn(option.choices, value);
}

/**
 * The options' values from `set` (e.g. saved settings, from another version of Stash TV), with the defaults for those
 * not set or set to a value they can't take, and without options the schema doesn't have
 */
export function resolveOptions<S extends OptionsSchema>(schema: S, set: Record<string, unknown> | undefined): OptionsOf<S> {
  return Object.fromEntries(Object.entries(schema).map(([name, option]) => {
    const value = set?.[name];
    return [name, value !== undefined && isAllowedValue(option, value) ? value : option.default];
  })) as OptionsOf<S>;
}
