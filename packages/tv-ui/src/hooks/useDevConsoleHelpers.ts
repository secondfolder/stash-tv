import { useEffect } from "react";
import { useTvConfig } from "../store/tvConfig";
import { useGlobalState } from "../store/globalState";

declare global {
  interface Window {
    freeze?: (countdown?: number) => void;
    showSettings?(): void;
    setTvConfig?(propName: string, value: any): void;
    getAppState?(propName: string): void;
  }
}

export function useDevConsoleHelpers() {
  const { showDevOptions, get: getAppState, set: setTvConfig } = useTvConfig()
  const { set: setGlobalState } = useGlobalState()
  useEffect(() => {
    if (showDevOptions) {
      window.freeze = (countdown = 2) => {
        setTimeout(() => {debugger}, countdown * 1000);
      };
      window.showSettings = () => setGlobalState("showSettings", true);
      window.setTvConfig = setTvConfig
      window.getAppState = getAppState
    } else {
      delete window.freeze;
      delete window.showSettings;
      delete window.setTvConfig;
      delete window.getAppState;
    }
  }, [showDevOptions]);
}
