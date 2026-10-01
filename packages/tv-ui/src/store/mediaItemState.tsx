import React from "react"
import { createContext, ReactNode, useContext, useMemo } from 'react';
import { createStore, useStore } from 'zustand';

type MediaItemState = {
  openFolderId: string;
  preIncrementOCounterValue: number;
  mediaSlideElementRef: React.RefObject<HTMLDivElement>;
}

type MediaItemStateActions = {
  set: <PropName extends keyof MediaItemState>(propName: PropName, value: MediaItemState[PropName] | ((prev: MediaItemState[PropName]) => MediaItemState[PropName])) => void;
  get: <PropName extends keyof MediaItemState>(propName: PropName) => MediaItemState[PropName];
  setToDefault: <PropName extends keyof typeof defaults>(propName: PropName) => void;
  getDefault: <PropName extends keyof typeof defaults>(propName: PropName) => typeof defaults[PropName];
}

const defaults = {
  openFolderId: '',
  preIncrementOCounterValue: 0,
  mediaSlideElementRef: {
    current: null
  },
} satisfies MediaItemState;

export type MediaItemStore = ReturnType<typeof createMediaItemStore>;

export function createMediaItemStore(
  {initialValues}: {initialValues?: Partial<MediaItemState>}
) {
  return createStore<MediaItemState & MediaItemStateActions>()((set, get) => ({
    ...defaults,
    ...initialValues,
    set: <PropName extends keyof MediaItemState>(propName: PropName, value: MediaItemState[PropName] | ((prev: MediaItemState[PropName]) => MediaItemState[PropName])) => {
      set((state) => {
        const resolvedValue = typeof value === 'function' ? value(state[propName]) : value;
        return { [propName]: resolvedValue };
      });
    },
    setToDefault: <PropName extends keyof typeof defaults>(propName: PropName) => {
      set({ [propName]: defaults[propName] });
    },
    getDefault: <PropName extends keyof typeof defaults>(propName: PropName) => {
      return defaults[propName];
    },
    get: <PropName extends keyof MediaItemState>(propName: PropName) => {
      return get()[propName];
    },
  }));
}

export const MediaItemStateContext = createContext<MediaItemStore | null>(null);

export const MediaItemStateContextProvider = (
  {children, initialValues}: {children?: ReactNode, initialValues?: Partial<MediaItemState>}
) => {
  // Deliberately created once per slide: these are the slide's *starting* values and must not follow later props.
  // For example `preIncrementOCounterValue` is the o-count the slide was shown with, which the o-counter button
  // compares the live count against; syncing it would stop the button ever showing that it was marked.
  const store = useMemo(() => createMediaItemStore({initialValues}), [])
  return (
    <MediaItemStateContext.Provider value={store}>
      {children}
    </MediaItemStateContext.Provider>
  )
}

export function hasMediaItemStateContext() {
  const store = useContext(MediaItemStateContext);
  return Boolean(store)
}

export function useMediaItemState() {
  const store = useContext(MediaItemStateContext);
  if (!store) throw new Error('useMediaItemState must be used within a MediaItemStateContext.Provider');
  return useStore(store)
}
