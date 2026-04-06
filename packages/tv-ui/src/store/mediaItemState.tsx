import React from "react"
import { createContext, ReactNode, useContext, useMemo } from 'react';
import { createStore, useStore } from 'zustand';

type MediaItemState = {
  openFolderId: string;
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
  mediaSlideElementRef: {
    current: null
  },
} satisfies MediaItemState;

export type MediaItemStore = ReturnType<typeof createMediaItemStore>;

export function createMediaItemStore(
  {initialValues}: {initialValues?: Partial<MediaItemState & MediaItemStateActions>}
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
  {children, initialValues}: {children?: ReactNode, initialValues?: Partial<MediaItemState & MediaItemStateActions>}
) => {
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
