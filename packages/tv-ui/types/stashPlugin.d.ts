import { PluginApi } from "stash-ui/dist/src/pluginApi.js"
import type { CheckboxGroup } from "stash-ui/dist/src/components/Settings/SettingsInterfacePanel/CheckboxGroup";
import type { ListFilterModel } from "stash-ui/dist/src/models/list-filter/filter";

/**
 * What an "instead" patch renders: a single element, never an array. Stash hands the result to "after" patches as
 * `args.concat(result)`, which spreads an array, so another plugin's after patch reading its last argument would get
 * only the last element. Wrap several elements in a Fragment.
 */
type PatchRender = React.ReactElement | null;



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
              _: object,
              Original: React.JSX
            ) => PatchRender,
          ): void,
          (
            component: "SceneList",
            fn: (
              props: React.PropsWithChildren<{
                filter: ListFilterModel;
                selectedIds: Set<string>;
              }>,
              _: object,
              Original: React.JSX
            ) => PatchRender,
          ): void,
          (
            component: string,
            fn: (
              props: React.PropsWithChildren<{}>,
              _: object,
              Original: React.JSX
            ) => PatchRender
          ): void,
        }
      }
    }
  }
}
