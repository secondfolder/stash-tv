import { PluginApi } from "stash-ui/dist/src/pluginApi.js"
import type { CheckboxGroup } from "stash-ui/dist/src/components/Settings/SettingsInterfacePanel/CheckboxGroup";
import type { ListFilterModel } from "stash-ui/dist/src/models/list-filter/filter";

/**
 * What an "instead" patch renders: a single element, never an array. Stash hands the result to "after" patches as
 * `args.concat(result)`, which spreads an array, so another plugin's after patch reading its last argument would get
 * only the last element. Wrap several elements in a Fragment.
 */
type PatchRender = React.ReactElement | null;

/**
 * What an "instead" patch is passed after the props: whatever other arguments the component was called with, then the
 * next in the chain of patches (`Original`, the component itself at the end of it), always last. React calls a
 * component with a second argument as well, but another plugin's "before" patch can return fewer or more arguments
 * than it's passed (AI Overhaul's on `MainNavBar.MenuItems` returns only the props), so `Original` isn't always third.
 * Take it with `originalFrom(args)`.
 */
type InsteadArgs = [...unknown[], React.JSX];



declare global {
  interface Window {
    PluginApi: Omit<typeof PluginApi, "patch"> & {
      patch: Omit<typeof PluginApi.patch, "instead"> & {
        instead: {
          (
            component: "CheckboxGroup",
            fn: CheckboxGroup
          ): void,
          (
            component: "PluginSettings",
            fn: (
              props: React.PropsWithChildren<{
                pluginID: string;
                settings: GQL.PluginSetting[];
              }>,
              ...args: InsteadArgs
            ) => PatchRender,
          ): void,
          (
            component: "SceneList",
            fn: (
              props: React.PropsWithChildren<{
                filter: ListFilterModel;
                selectedIds: Set<string>;
              }>,
              ...args: InsteadArgs
            ) => PatchRender,
          ): void,
          (
            component: string,
            fn: (
              props: React.PropsWithChildren<{}>,
              ...args: InsteadArgs
            ) => PatchRender
          ): void,
        }
      }
    }
  }
}
