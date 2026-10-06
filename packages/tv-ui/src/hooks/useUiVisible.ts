import { useGlobalState } from "../store/globalState";
import { useTvConfig } from "../store/tvConfig";

/**
 * Whether a slide's UI is shown: that of the slide showing `mediaItemId`, or of the current slide if it's left out.
 * `uiVisible` is the user's own choice (the ui-visibility action button), `uiIdle` whether the slide's UI is faded out
 * after a mouse user went idle (`useUiAutoHide`). Anything showing or hiding UI should read `shown`.
 *
 * @see docs/state-and-config.md § "UI visibility & auto-hide"
 */
export function useUiVisible(mediaItemId?: string) {
  const uiVisible = useTvConfig(state => state.uiVisible);
  const uiIdle = useGlobalState(state => (
    state.uiIdleMediaItemId !== null && state.uiIdleMediaItemId === (mediaItemId ?? state.currentMediaItemId)
  ));
  return { uiVisible, uiIdle, shown: uiVisible && !uiIdle };
}
