import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware'
import { stashConfigStorage } from '../helpers/stash-config-storage';
import type { SceneInfoEditorPillContent, SceneInfoFieldOptionsConfig, SceneInfoLayout } from '../components/slide/SceneInfo/scene-info-config';
export type DebuggingInfo = "render-debugging" | "onscreen-info" | "virtualizer-debugging";

export const globalStateStorageKey = 'app-state';

type GlobalState = {
  showSettings: boolean;
  fullscreen: boolean;
  sceneInfoOpen: boolean;
  /**
   * The scene info panel's layout and field options being edited, or null when they aren't. Shared so editing survives
   * moving to another slide
   */
  sceneInfoDraft: { layout: SceneInfoLayout; fieldOptions: SceneInfoFieldOptionsConfig } | null;
  /** What the scene info panel's editor's pills show. Shared, like the draft, so it's kept moving to another slide */
  sceneInfoEditorPillContent: SceneInfoEditorPillContent;
  keyboardShortcutsOpen: boolean;
  /** The media item of the feed's current slide, set by `VideoScroller` */
  currentMediaItemId: string | null;
  /**
   * The media item whose slide's UI is faded out because a mouse user went idle while it was current (see
   * `useUiAutoHide`), or null. Separate from tvConfig's `uiVisible`, the user's own choice: what's shown is
   * `useUiVisible().shown`
   */
  uiIdleMediaItemId: string | null;
  tvConfigLoaded: boolean;
}

type GlobalStateActions = {
  set: <PropName extends keyof GlobalState>(propName: PropName, value: GlobalState[PropName] | ((prev: GlobalState[PropName]) => GlobalState[PropName])) => void;
  get: <PropName extends keyof GlobalState>(propName: PropName) => GlobalState[PropName];
  setToDefault: <PropName extends keyof typeof defaults>(propName: PropName) => void;
  getDefault: <PropName extends keyof typeof defaults>(propName: PropName) => typeof defaults[PropName];
}

const defaults = {
  showSettings: false,
  fullscreen: false,
  sceneInfoOpen: false,
  sceneInfoDraft: null,
  sceneInfoEditorPillContent: "names",
  keyboardShortcutsOpen: false,
  currentMediaItemId: null,
  uiIdleMediaItemId: null,
  tvConfigLoaded: false,
} satisfies GlobalState;

export const useGlobalState = create<GlobalState & GlobalStateActions>()(
  (set, get) => ({
    ...defaults,
    set: <PropName extends keyof GlobalState>(propName: PropName, value: GlobalState[PropName] | ((prev: GlobalState[PropName]) => GlobalState[PropName])) => {
      if (!get().tvConfigLoaded && propName !== "tvConfigLoaded") {
        console.warn(`Tried to set ${propName} to "${value}" before store was loaded`);
        return;
      }
      set((state) => {
        const resolvedValue = typeof value === "function" ? value(state[propName]) : value
        return {
          [propName]: resolvedValue,
        };
      });
    },
    setToDefault: <PropName extends keyof typeof defaults>(propName: PropName) => {
      if (!get().tvConfigLoaded) {
        console.warn(`Tried to set ${propName} to default before store was loaded`);
        return;
      }
      set((state) => {
        return {
          [propName]: defaults[propName],
        };
      });
    },
    getDefault: <PropName extends keyof typeof defaults>(propName: PropName) => {
      return defaults[propName];
    },
    get: <PropName extends keyof GlobalState>(propName: PropName) => {
      return get()[propName];
    },
  })
);
