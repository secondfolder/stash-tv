import { describe, expect, expectTypeOf, it } from "vitest";
import { Eye, EyeFill } from "react-bootstrap-icons";
import {
  choice,
  defaultOptions,
  isAllowedValue,
  labelOption,
  resolveOptions,
  toggle,
  type OptionsOf,
} from "../../../src/components/slide/SceneInfo/field-options";
import type { SceneInfoFieldOptions } from "../../../src/components/slide/SceneInfo/scene-info-config";

/** @see docs/scene-info-panel.md § "Field options" */
describe("declaring a field's options", () => {
  const schema = {
    display: choice({ control: "Control", text: "Text" }, "control", { label: "Show as" }),
    showAll: toggle(false, { label: "Show all" }),
    label: labelOption({ name: "Play count", icons: { active: EyeFill, inactive: Eye }, default: "icon" }),
    optionalLabel: labelOption({ name: "Resolution", icons: { active: Eye, inactive: Eye }, allowNone: true, default: "none" }),
  };

  it("gives the options' types from their choices", () => {
    expectTypeOf<OptionsOf<typeof schema>>().toEqualTypeOf<{
      display: "control" | "text";
      showAll: boolean;
      label: "icon" | "text";
      optionalLabel: "icon" | "text" | "none";
    }>();
    expectTypeOf<SceneInfoFieldOptions["rating"]["display"]>().toEqualTypeOf<"control" | "text">();
    expectTypeOf<SceneInfoFieldOptions["resolution"]["label"]>().toEqualTypeOf<"icon" | "text" | "none">();
  });

  it("gives their defaults", () => {
    expect(defaultOptions(schema)).toEqual({ display: "control", showAll: false, label: "icon", optionalLabel: "none" });
  });

  it("offers \"None\" as a label only where it's allowed, first", () => {
    expect(Object.keys(schema.label.choices)).toEqual(["icon", "text"]);
    expect(Object.keys(schema.optionalLabel.choices)).toEqual(["none", "icon", "text"]);
    expect(schema.label.choices.text).toBe("Play count");
  });

  it("allows only the values an option can take", () => {
    expect(isAllowedValue(schema.display, "text")).toBe(true);
    expect(isAllowedValue(schema.display, "sparkles")).toBe(false);
    expect(isAllowedValue(schema.label, "none")).toBe(false);
    expect(isAllowedValue(schema.showAll, true)).toBe(true);
    expect(isAllowedValue(schema.showAll, "yes")).toBe(false);
  });

  it("reads saved options, with the defaults for the rest and none it doesn't have", () => {
    expect(resolveOptions(schema, { display: "text", showAll: "yes", unknown: 1 }))
      .toEqual({ display: "text", showAll: false, label: "icon", optionalLabel: "none" });
  });
});
