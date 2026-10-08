/**
 * Plugin settings tests
 *
 * Drives the real PluginSettings patch from main.tsx: pass-through for other
 * plugins, the reset button persisting an empty config via ConfigurePlugin,
 * and the dev-options JSON inspector gated on showDevOptions.
 */

import { describe, it, expect } from "vitest";
import { afterPatchArgs, type MockReactElement } from "./plugin-api-mock";
import { importPlugin } from "./test-harness";

const Original = () => "original";

const ownProps = { pluginID: "stash-tv" };
const otherProps = { pluginID: "some-other-plugin" };

function stashConfigWithAppState(showDevOptions: boolean) {
  return {
    plugins: {
      "stash-tv": {
        "app-state": JSON.stringify({ state: { showDevOptions } }),
      },
    },
    interface: { menuItems: [] },
  };
}

/** Recursively collect all elements in a mock React tree. */
function flatten(node: unknown): MockReactElement[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (node && typeof node === "object" && "type" in node && "props" in node) {
    const element = node as MockReactElement;
    return [element, ...flatten(element.props.children)];
  }
  return [];
}

/** Let pending promise chains (config fetch → setState) settle. */
async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

/** Invoke a patch implementation as a component render. */
function render(
  mock: Awaited<ReturnType<typeof importPlugin>>,
  patch: { implementation: (...args: unknown[]) => unknown },
  props: unknown
) {
  mock.react.beginRender();
  return patch.implementation(props, undefined, Original);
}

describe("PluginSettings patch", () => {
  it("renders the original settings for other plugins", async () => {
    const mock = await importPlugin({ plugins: { "stash-tv": { initialSetupComplete: true } } });
    const patch = mock.patchFor("PluginSettings");

    const result = render(mock, patch, otherProps);

    expect(Array.isArray(result)).toBe(false);
    expect((result as { type: unknown }).type).toBe(Original);
  });

  it("hands another plugin's after patch the whole render for its own settings", async () => {
    const mock = await importPlugin({ plugins: { "stash-tv": { initialSetupComplete: true } } });
    const patch = mock.patchFor("PluginSettings");

    const result = render(mock, patch, ownProps);

    expect(afterPatchArgs([ownProps, undefined], result).at(-1)).toBe(result);
  });

  it("resets all Stash TV settings to an empty config when Reset is clicked", async () => {
    const mock = await importPlugin({
      plugins: { "stash-tv": { volume: 50, initialSetupComplete: true } },
    });
    const patch = mock.patchFor("PluginSettings");
    mock.mutate.mockClear();

    const result = render(mock, patch, ownProps);
    const buttons = flatten(result).filter(
      (element) => element.type === mock.pluginApi.libraries.Bootstrap.Button
    );
    expect(buttons.length).toBeGreaterThan(0);

    const onClick = buttons[0].props.onClick as () => Promise<void>;
    await onClick();
    await flushAsyncWork();

    expect(mock.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: "ConfigurePluginDocument",
        variables: expect.objectContaining({ plugin_id: "stash-tv", input: {} }),
      })
    );
  });

  it("does not show the dev options JSON inspector when showDevOptions is false", async () => {
    const mock = await importPlugin(stashConfigWithAppState(false));
    const patch = mock.patchFor("PluginSettings");

    render(mock, patch, ownProps);
    mock.react.runEffects();
    await flushAsyncWork();
    const rerendered = render(mock, patch, ownProps);

    expect(JSON.stringify(rerendered)).not.toContain("Stash TV settings JSON");
  });

  it("shows the dev options JSON inspector when showDevOptions is true", async () => {
    const mock = await importPlugin(stashConfigWithAppState(true));
    const patch = mock.patchFor("PluginSettings");

    render(mock, patch, ownProps);
    mock.react.runEffects();
    await flushAsyncWork();
    const rerendered = render(mock, patch, ownProps);

    expect(JSON.stringify(rerendered)).toContain("Stash TV settings JSON");
  });
});
