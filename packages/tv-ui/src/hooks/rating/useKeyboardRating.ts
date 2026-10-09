import { useEffect } from "react";
import { useLatest } from "react-use";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { useGlobalState } from "../../store/globalState";
import { matchShortcut, shortcutDigits } from "../useKeyboardShortcuts";
import { useSetRating } from "./useSetRating";

/** The rating each digit sets with star ratings */
const starRatings: Record<string, number> = { "1": 20, "2": 40, "3": 60, "4": 80, "5": 100 };

/** The rating100 the digits typed after the rating key set, as Stash's own shortcuts would: `00` is 10.0 */
function ratingFromDigits(digits: string[], ratingSystem: RatingSystemType): number | undefined {
  if (ratingSystem !== RatingSystemType.Decimal) return starRatings[digits[0]];
  const rating = parseInt(digits.join(""), 10);
  return rating === 0 ? 100 : rating;
}

/**
 * Binds the rating keyboard shortcuts (`r {1-5}` / `r {0-9} {0-9}`, and `r 0` / ``r ` `` to unset, by default) to rate
 * the given scene.
 *
 * Safe to call from any number of mounted components at once (e.g. every rendered MediaSlide): only instances with
 * `enabled` set listen. Callers must ensure at most one instance is enabled at a time (for slides, the current one).
 *
 * @see docs/keyboard-shortcuts.md § "Rating shortcuts"
 */
export function useKeyboardRating(scene: GQL.SceneDataFragment, { enabled }: { enabled: boolean }) {
  const setRating = useLatest(useSetRating(scene));

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = matchShortcut(event, ["rate", "unset-rating"]);
      if (action === "unset-rating") {
        setRating.current(null);
      } else if (action === "rate") {
        const rating = ratingFromDigits(shortcutDigits(event), useGlobalState.getState().ratingSystem);
        if (rating !== undefined) setRating.current(rating);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
