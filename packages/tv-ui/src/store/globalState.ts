import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware'
import { stashConfigStorage } from '../helpers/stash-config-storage';
export type DebuggingInfo = "render-debugging" | "onscreen-info" | "virtualizer-debugging";

export const globalStateStorageKey = 'app-state';

type GlobalState = {
  showSettings: boolean;
  fullscreen: boolean;
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
