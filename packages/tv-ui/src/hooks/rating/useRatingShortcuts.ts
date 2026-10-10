import { useEffect } from "react";
import { useLatest } from "react-use";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { useGlobalState } from "../../store/globalState";
import { onShortcut } from "../../helpers/shortcut-actions/input";
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
 * Binds the rating shortcuts (`r {1-5}` / `r {0-9} {0-9}`, and `r 0` / ``r ` `` to unset, by default) to rate the given
 * scene. A gamepad can unset the rating too, but can't rate (it can't type the digits).
 *
 * Safe to call from any number of mounted components at once (e.g. every rendered MediaSlide): only instances with
 * `enabled` set listen. Callers must ensure at most one instance is enabled at a time (for slides, the current one).
 *
 * @see docs/keyboard-shortcuts.md § "Rating shortcuts"
 */
export function useRatingShortcuts(scene: GQL.SceneDataFragment, { enabled }: { enabled: boolean }) {
  const setRating = useLatest(useSetRating(scene));

  useEffect(() => {
    if (!enabled) return;
    return onShortcut("press", (trigger) => {
      const action = trigger.match(["rate", "unset-rating"]);
      if (action === "unset-rating") {
        setRating.current(null);
      } else if (action === "rate") {
        const rating = ratingFromDigits(trigger.digits(), useGlobalState.getState().ratingSystem);
        if (rating !== undefined) setRating.current(rating);
      }
    });
  }, [enabled]);
}
