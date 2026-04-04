import { useGamepadState } from "../store/gamepadState";

/** Returns the global gamepad connection status tracked by useGamepad. */
export function useGamepadStatus(): { isConnected: boolean; connectedAt: number | null } {
  const isConnected = useGamepadState((state) => state.isConnected);
  const connectedAt = useGamepadState((state) => state.connectedAt);
  return { isConnected, connectedAt };
}
