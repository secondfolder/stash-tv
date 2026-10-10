import { create } from 'zustand';
import type { ControllerLayout, ControlId } from '../helpers/gamepad/controls';

const noControls: ReadonlySet<ControlId> = new Set();

type GamepadState = {
  isConnected: boolean;
  connectedAt: number | null;
  /** Whose names the connected controller's controls have */
  layout: ControllerLayout;
  /** The controls held down now, on any controller (the settings highlight them) */
  pressedControls: ReadonlySet<ControlId>;
  setConnected: (connected: boolean) => void;
  setLayout: (layout: ControllerLayout) => void;
  setPressedControls: (controls: ReadonlySet<ControlId>) => void;
};

export const useGamepadState = create<GamepadState>()((set) => ({
  isConnected: false,
  connectedAt: null,
  layout: "xbox",
  pressedControls: noControls,
  setConnected: (connected) =>
    set((state) => ({
      isConnected: connected,
      connectedAt: connected && !state.isConnected ? Date.now() : state.connectedAt,
      pressedControls: connected ? state.pressedControls : noControls,
    })),
  setLayout: (layout) => set({ layout }),
  setPressedControls: (controls) => set({ pressedControls: controls }),
}));
