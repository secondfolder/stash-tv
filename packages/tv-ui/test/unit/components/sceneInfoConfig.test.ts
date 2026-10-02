import { describe, expect, it } from "vitest";
import { replaceItem } from "../../../src/components/LineLayoutEditor/line-layout";
import {
  defaultSceneInfoFieldOptions,
  hasFieldOptions,
  resolveFieldOptions,
  entryField,
  entryKey,
  entryLabel,
  newFieldInstance,
  fieldsNotInLayout,
  noValueLabel,
} from "../../../src/components/slide/SceneInfo/scene-info-config";

/** @see docs/scene-info-panel.md § "Customising the panel" */
describe("the fields offered to add to the panel", () => {
  it("are only those that aren't in the layout", () => {
    const layout = [["studio"], ["title", "date"], ["performers"]];
    const notInLayout = fieldsNotInLayout(layout);
    expect(notInLayout).toContain("tags");
    expect(notInLayout).not.toContain("title");
    expect(fieldsNotInLayout([{ left: [], right: ["tags"] }])).not.toContain("tags");
  });
});

/** @see docs/scene-info-panel.md § "Customising the panel" */
describe("what a field with no value shows", () => {
  it("reads in sentence case", () => {
    expect(noValueLabel("studio")).toBe("No studio");
    expect(noValueLabel("code")).toBe("No studio code");
  });

  it("keeps the capitals of names that aren't simply capitalised", () => {
    expect(noValueLabel("urls")).toBe("No URLs");
    expect(noValueLabel("o-count")).toBe("No O-count");
  });
});

/** @see docs/scene-info-panel.md § "Field options" */
describe("the scene info panel's field options", () => {
  it("are the defaults when none have been set", () => {
    expect(resolveFieldOptions({})).toEqual(defaultSceneInfoFieldOptions);
    expect(resolveFieldOptions(undefined)).toEqual(defaultSceneInfoFieldOptions);
  });

  it("keep the defaults for the options that haven't been set", () => {
    expect(resolveFieldOptions({ resolution: { label: "text" } }).resolution).toEqual({ label: "text", format: "name" });
  });

  it("ignore values they can't take, which another version of Stash TV may have saved", () => {
    const options = resolveFieldOptions({
      rating: { display: "sparkles" },
      tags: { showAll: "yes" },
      details: { showFullText: true, unknownOption: 1 },
      "unknown-field": { display: "text" },
    });
    expect(options.rating).toEqual({ display: "control" });
    expect(options.tags).toEqual({ showAll: false });
    expect(options.details).toEqual({ showFullText: true });
    expect(options).not.toHaveProperty("unknown-field");
  });

  it("don't change the defaults", () => {
    resolveFieldOptions({ rating: { display: "text" } }).rating.display = "control";
    expect(defaultSceneInfoFieldOptions.rating.display).toBe("control");
  });

  it("are offered only for fields that can be shown more than one way", () => {
    expect(hasFieldOptions("rating")).toBe(true);
    expect(hasFieldOptions("title")).toBe(false);
    expect(hasFieldOptions("toString")).toBe(false);
  });
});

/** @see docs/scene-info-panel.md § "Spacers" */
describe("the scene info panel's spacers", () => {
  it("are always among the unused fields, however many are in the layout", () => {
    expect(fieldsNotInLayout([["title", newFieldInstance("spacer")]])).toContain("spacer");
  });

  it("are each an instance of their own, told apart by their keys", () => {
    const [first, second] = [newFieldInstance("spacer"), newFieldInstance("spacer")];
    expect(entryKey(first)).not.toBe(entryKey(second));
    expect(entryField(first)).toBe("spacer");
    expect(entryKey("title")).toBe("title");
  });

  it("each have options of their own", () => {
    const big = { field: "spacer", id: "1", options: { size: "big" } };
    // A field's options are no instance's
    const config = { spacer: { size: "small" } };
    expect(resolveFieldOptions(config, big).spacer).toEqual({ size: "big" });
    expect(resolveFieldOptions(config, { field: "spacer", id: "2" }).spacer).toEqual({ size: "medium" });
    expect(resolveFieldOptions(config, { field: "spacer", id: "3", options: { size: "huge" } }).spacer).toEqual({ size: "medium" });
  });

  it("are named after their size, apart from the one among the unused fields", () => {
    const big = { field: "spacer", id: "1", options: { size: "big" } };
    expect(entryLabel(big, resolveFieldOptions({}, big))).toBe("Big spacer");
    expect(entryLabel("spacer", resolveFieldOptions({}))).toBe("Spacer");
  });

  it("have their options changed where they are in the layout", () => {
    const spacer = { field: "spacer", id: "1" };
    const resized = { ...spacer, options: { size: "small" } };
    expect(replaceItem([["title", spacer], { left: [], right: [spacer] }], entryKey, entryKey(spacer), resized))
      .toEqual([["title", resized], { left: [], right: [resized] }]);
  });

  it("treat an instance saved broken as an unknown field", () => {
    expect(entryField({ id: "1" } as never)).toBe("");
  });
});
