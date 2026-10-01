import { useContext } from "react";
import { ConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { useSetRating } from "./useSetRating";
import { useRatingKeybinds } from "stash-ui/dist/src/hooks/keybinds";

/**
 * Binds Stash's rating keyboard shortcuts (`r {1-5}`, `r {0-9} {0-9}`, etc.) to rate the given scene.
 *
 * Safe to call from any number of mounted components at once (e.g. every rendered MediaSlide): the bindings are
 * global Mousetrap bindings, so only instances with `enabled` set bind them, and a disabled instance never binds or
 * unbinds anything — it can't fire, and it can't clobber the enabled instance's bindings when it re-renders or
 * unmounts. Callers must ensure at most one instance is enabled at a time (for slides, the current one).
 *
 * @see docs/keyboard-shortcuts.md § "Rating shortcuts"
 */
export function useKeyboardRating(scene: GQL.SceneDataFragment, { enabled }: { enabled: boolean }) {
  const { configuration: stashConfig } = useContext(ConfigurationContext)
  const setRating = useSetRating(scene);

  useRatingKeybinds(
    enabled,
    stashConfig?.ui?.ratingSystemOptions?.type,
    // Stash's keybinds use NaN to mean "unset rating"
    (rating) => setRating(Number.isNaN(rating) ? null : rating)
  );
}
