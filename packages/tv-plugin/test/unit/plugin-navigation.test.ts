/**
 * Plugin navigation tests
 *
 * Drives the real patch implementations from main.tsx: the CheckboxGroup
 * injection of the tv menu-item checkbox, and the MainNavBar.MenuItems
 * gating of the TV nav button on interface.menuItems.
 */

import { describe, it, expect, vi } from "vitest";
import type { MockReactElement } from "./plugin-api-mock";
import { importPlugin } from "./test-harness";

// See plugin-initialization.test.ts for why StashService is stubbed.
vi.mock("stash-ui/dist/src/core/StashService", () => ({
  getClient: () => ({ cache: {}, link: undefined }),
}));

/** Recursively collect all elements in a mock React tree. */
function flatten(node: unknown): MockReactElement[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (node && typeof node === "object" && "type" in node && "props" in node) {
    const element = node as MockReactElement;
    return [element, ...flatten(element.props.children)];
  }
  return [];
}

const Original = () => "original";

describe("CheckboxGroup patch", () => {
  it("adds the tv checkbox to the menu-items group", async () => {
    const mock = await importPlugin({ plugins: { "stash-tv": { initialSetupComplete: true } } });
    const patch = mock.patchFor("CheckboxGroup");

    const items = [
      { id: "scenes", headingID: "Scenes" },
      { id: "images", headingID: "Images" },
    ];
    const result = patch.implementation({ groupId: "menu-items", items }) as [
      { groupId: string; items: unknown[] }
    ];

    expect(result[0].items).toEqual([...items, { id: "tv", headingID: "TV" }]);
  });

  it("leaves other checkbox groups untouched", async () => {
    const mock = await importPlugin({ plugins: { "stash-tv": { initialSetupComplete: true } } });
    const patch = mock.patchFor("CheckboxGroup");

    const props = { groupId: "other-group", items: [{ id: "a", headingID: "A" }] };
    const result = patch.implementation(props) as unknown[];

    expect(result[0]).toBe(props);
  });
});

describe("MainNavBar.MenuItems patch", () => {
  async function renderNavButton(
    configuration: unknown,
    loading: boolean
  ): Promise<MockReactElement[]> {
    const mock = await importPlugin({ plugins: { "stash-tv": { initialSetupComplete: true } } });
    const patch = mock.patchFor("MainNavBar.MenuItems");
    mock.useConfigurationQuery.mockReturnValue({ data: configuration, loading });

    const result = patch.implementation({ children: [] }, undefined, Original);
    const root = Array.isArray(result) ? result : [result];
    return root.flatMap(flatten);
  }

  it("shows the TV nav button when tv is in interface.menuItems", async () => {
    const elements = await renderNavButton(
      { configuration: { interface: { menuItems: ["scenes", "tv"] } } },
      false
    );

    expect(elements.some((el) => (el.type as { name?: string })?.name === "StashTVButtonInner")).toBe(
      true
    );
    expect(elements.some((el) => el.type === Original)).toBe(true);
  });

  it("hides the TV nav button when tv is not in interface.menuItems", async () => {
    const elements = await renderNavButton(
      { configuration: { interface: { menuItems: ["scenes"] } } },
      false
    );

    expect(elements.some((el) => (el.type as { name?: string })?.name === "StashTVButtonInner")).toBe(
      false
    );
  });

  it("hides the TV nav button while the configuration is loading", async () => {
    const elements = await renderNavButton(
      { configuration: { interface: { menuItems: ["tv"] } } },
      true
    );

    expect(elements.some((el) => (el.type as { name?: string })?.name === "StashTVButtonInner")).toBe(
      false
    );
  });
});
