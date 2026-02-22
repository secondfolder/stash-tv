import { useEffect } from "react";
import { useAppStateStore } from "../store/appStateStore";

declare global {
  interface Window {
    freeze?: (countdown?: number) => void;
    showSettings?(): void;
    setAppState?(propName: string, value: any): void;
    getAppState?(propName: string): void;
  }
}

export function useDevConsoleHelpers() {
  const { showDevOptions, get: getAppState, set: setAppState } = useAppStateStore()
  useEffect(() => {
    if (showDevOptions) {
      window.freeze = (countdown = 2) => {
        setTimeout(() => {debugger}, countdown * 1000);
      };
      window.showSettings = () => setAppState("showSettings", true);
      window.setAppState = setAppState
      window.getAppState = getAppState
    } else {
      delete window.freeze;
      delete window.showSettings;
      delete window.setAppState;
      delete window.getAppState;
    }
  }, [showDevOptions]);
}
