import { LogLevel } from '@logtape/logtape';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultLogLevel } from '../helpers/logging';
import { stashConfigStorage } from '../helpers/stash-config-storage';
import { useGlobalState } from "./globalState"
import { ActionButtonStackConfig } from '../components/action-buttons/ActionButtonStack';
export type DebuggingInfo = "render-debugging" | "onscreen-info" | "virtualizer-debugging";

export const tvConfigStorageKey = 'app-state';

type TvConfig = {
  volume: number;
  showSubtitles: boolean;
  letterboxing: boolean;
  looping: boolean;
  uiVisible: boolean;
  isRandomised: boolean;
  crtEffect: boolean;
  crtEffectStrength: number;
  scenePreviewOnly: boolean;
  markerPreviewOnly: boolean;
  onlyShowMatchingOrientation: boolean;
  maxMedia: undefined | number;
  autoPlay: boolean;
  startPosition: 'resume' | 'beginning' | 'random';
  endPosition: 'video-end' | 'fixed-length' | 'random-length';
  playLength?: number;
  pageSize: number;
  mediaItemsModifierFunction?: string;
  minPlayLength?: number;
  maxPlayLength?: number;
  showGuideOverlay?: boolean;
  leftHandedUi?: boolean;
  actionButtonStackConfig: ActionButtonStackConfig[];
  currentFilterId?: string;
  // Device specific state
  forceLandscape: boolean;
  // Developer options
  showDevOptions: boolean;
  renderedMediaItemsBuffer: number;
  logLevel: LogLevel;
  loggersToShow: (readonly string[])[];
  loggersToHide: (readonly string[])[];
  showDebuggingInfo: (DebuggingInfo)[];
  videoJsEventsToLog: readonly string[];
  playbackRate: number;
}

type AppAction = {
  set: <PropName extends keyof TvConfig>(propName: PropName, value: TvConfig[PropName] | ((prev: TvConfig[PropName]) => TvConfig[PropName])) => void;
  get: <PropName extends keyof TvConfig>(propName: PropName) => TvConfig[PropName];
  setToDefault: <PropName extends keyof typeof defaults>(propName: PropName) => void;
  getDefault: <PropName extends keyof typeof defaults>(propName: PropName) => typeof defaults[PropName];
}

const defaults = {
  volume: 0,
  showSubtitles: false,
  letterboxing: false,
  forceLandscape: false,
  looping: false,
  uiVisible: true,
  isRandomised: false,
  crtEffect: false,
  crtEffectStrength: 1,
  scenePreviewOnly: false,
  markerPreviewOnly: false,
  onlyShowMatchingOrientation: false,
  maxMedia: undefined,
  autoPlay: true,
  startPosition: 'resume',
  endPosition: 'video-end',
  showGuideOverlay: true,
  showDevOptions: false,
  logLevel: defaultLogLevel,
  pageSize: 5,
  loggersToShow: [],
  loggersToHide: [],
  showDebuggingInfo: [],
  renderedMediaItemsBuffer: 2,
  videoJsEventsToLog: [],
  actionButtonStackConfig: [
    {id: "1", type: "button", buttonType: "ui-visibility", pinned: true},
    {id: "2", type: "button", buttonType: "settings", pinned: false},
    {id: "3", type: "button", buttonType: "show-scene-info", pinned: false},
    {id: "12", type: "folder", pinned: false, contents: [
      {id: "12.1", type: "button", buttonType: "rate-scene", pinned: false},
      {id: "12.2", type: "button", buttonType: "o-counter", pinned: false},
      {id: "12.3", type: "button", buttonType: "set-organized", pinned: false},
      {id: "12.4", type: "button", buttonType: "edit-tags", pinned: false, pinnedTagIds: []},
      {id: "12.5", type: "button", buttonType: "delete-media-item", pinned: false},
    ]},
    {id: "6", type: "button", buttonType: "force-landscape", pinned: false},
    {id: "8", type: "button", buttonType: "volume", pinned: false},
    {id: "9", type: "button", buttonType: "letterboxing", pinned: false},
    {id: "13", type: "folder", pinned: false, contents: [
      {id: "13.1", type: "button", buttonType: "loop", pinned: false},
      {id: "13.2", type: "button", buttonType: "playback-rate", pinned: false},
      {id: "13.3", type: "button", buttonType: "subtitles", pinned: false},
      {id: "13.4", type: "button", buttonType: "fullscreen", pinned: false},
    ]}
  ],
  playbackRate: 1,
} satisfies TvConfig;

// Keys that should be stored in localStorage (device-specific)
const localStorageKeys: (keyof TvConfig)[] = [
  'forceLandscape',
]

// Custom storage that routes keys to different storage backends
const createHybridStorage = () => {
  const stashStorage = stashConfigStorage;
  const browserStorage = localStorage;

  return {
    getItem: async (name: string) => {
      // Try to get from both storages and merge
      const [stashData, localData] = await Promise.all([
        stashStorage.getItem(name),
        Promise.resolve(browserStorage.getItem(`${name}-local`))
      ]);

      if (!stashData && !localData) return null;

      const stashState = stashData ? JSON.parse(stashData).state : {};
      const localState = localData ? JSON.parse(localData).state : {};

      return JSON.stringify({
        state: { ...stashState, ...localState },
        version: stashState?.version ?? localState?.version ?? 0
      });
    },
    setItem: async (name: string, value: string) => {
      const parsed = JSON.parse(value);
      const state = parsed.state;

      // Split state into stash and local storage portions
      const stashState: Record<string, any> = {};
      const localState: Record<string, any> = {};

      for (const [key, val] of Object.entries(state)) {
        if (localStorageKeys.includes(key as keyof TvConfig)) {
          localState[key] = val;
        } else {
          stashState[key] = val;
        }
      }

      // Save to respective storages in parallel
      const promises: Promise<any>[] = [];
      if (Object.keys(stashState).length > 0) {
        promises.push(stashStorage.setItem(name, JSON.stringify({ ...parsed, state: stashState })));
      }
      if (Object.keys(localState).length > 0) {
        promises.push(Promise.resolve(
          browserStorage.setItem(`${name}-local`, JSON.stringify({ ...parsed, state: localState }))
        ));
      }
      await Promise.all(promises);
    },
    removeItem: async (name: string) => {
      await Promise.all([
        stashStorage.removeItem(name),
        Promise.resolve(browserStorage.removeItem(`${name}-local`))
      ]);
    }
  };
};

export const useTvConfig = create<TvConfig & AppAction>()(
  persist(
    (set, get) => ({
      ...defaults,
      set: <PropName extends keyof TvConfig>(propName: PropName, value: TvConfig[PropName] | ((prev: TvConfig[PropName]) => TvConfig[PropName])) => {
        if (!useGlobalState.getState().tvConfigLoaded) {
          console.warn(`Tried to set ${propName} to "${value}" before config was loaded`);
          return;
        }
        set((state) => {
          const resolvedValue = typeof value === "function" ? value(state[propName]) : value
          // For enableRenderDebugging we also save the enableRenderDebugging option separately in localStorage
          // so so that it can be read by renderDebugger.ts at the very start of the app before we've received the store
          // state from stash.
          if (propName === 'showDebuggingInfo') {
            const enableRenderDebugging = (resolvedValue as TvConfig['showDebuggingInfo'])
              .includes("render-debugging");
            const previousEnableRenderDebugging = localStorage.getItem("enableRenderDebugging") === "true";
            // We reload since renderDebugger.ts must be initialised at app start
            if (previousEnableRenderDebugging !== enableRenderDebugging) {
              // Allow time for zustand to save new state
              setTimeout(() => {
                localStorage.setItem("enableRenderDebugging", JSON.stringify(enableRenderDebugging));
                window.location.reload()
              }, 300);
            }
          }
          return {
            [propName]: resolvedValue,
          };
        });
      },
      setToDefault: <PropName extends keyof typeof defaults>(propName: PropName) => {
        if (!useGlobalState.getState().tvConfigLoaded) {
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
      get: <PropName extends keyof TvConfig>(propName: PropName) => {
        return get()[propName];
      },
    }),
    {
      name: tvConfigStorageKey,
      storage: createJSONStorage(() => createHybridStorage()),
      onRehydrateStorage: (state) => {
        return () => useGlobalState.setState({tvConfigLoaded: true})
      },
      version: 2,
      migrate: (persistedState, version) => {
        if (version === 0 && persistedState && typeof persistedState === "object") {
          if ('audioMuted' in persistedState) {
            // @ts-expect-error -- we're going to add the volume property
            persistedState.volume = persistedState.audioMuted ? 0 : 1;
            delete persistedState.audioMuted;
          }
          if ('actionButtonsConfig' in persistedState && Array.isArray(persistedState.actionButtonsConfig)) {
            for (const button of persistedState.actionButtonsConfig) {
              if (button.type === "mute") {
                button.type = "volume";
              }
            }
          }
        }
        if (version < 2 && persistedState && typeof persistedState === "object") {
          if ('actionButtonsConfig' in persistedState && Array.isArray(persistedState.actionButtonsConfig)) {
            const actionButtonStackConfig = persistedState.actionButtonsConfig
            // @ts-expect-error -- we know actionButtonStackConfig doesn't exist in the type, we're trying to add it
            persistedState.actionButtonStackConfig = actionButtonStackConfig
            delete persistedState.actionButtonsConfig
            for (const config of actionButtonStackConfig) {
              config.buttonType = config.type;
              config.type = "button";
            }
          }
        }
        return persistedState
      }
    }
  )
);
