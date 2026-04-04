import { create } from 'zustand';

type GamepadState = {
  isConnected: boolean;
  connectedAt: number | null;
  setConnected: (connected: boolean) => void;
};

export const useGamepadState = create<GamepadState>()((set) => ({
  isConnected: false,
  connectedAt: null,
  setConnected: (connected) =>
    set((state) => ({
      isConnected: connected,
      connectedAt: connected && !state.isConnected ? Date.now() : state.connectedAt,
    })),
}));
