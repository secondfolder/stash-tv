import React from "react";
import cx from "classnames";
import { RatingSystem as StashRatingSystem, IRatingSystemProps } from "stash-ui/dist/src/components/Shared/Rating/RatingSystem";
import "stash-ui/dist/src/components/Shared/Rating/styles.css";
import { ConfigurationContext } from "../../../dist/src/hooks/Config";
import { convertToRatingFormat, defaultRatingSystemOptions, RatingSystemType } from "../../../dist/src/utils/rating";
import "./RatingSystem.css";
import { RatingNumber } from "./RatingNumber";

export type RatingSystemProps = IRatingSystemProps & {
  /**
   * Which side of the stars their rating (or "Clear") is shown on. It comes and goes as they're hovered, so on the side
   * away from whatever's beside them it doesn't move the stars, or what's beside them, about.
   */
  valueSide?: "start" | "end";
};

/**
 * Stash's rating control. With stars, hovering the star of the current rating, which clears it when clicked, shows
 * "Clear" where the rating's shown: Stash shows nothing there then. Without a rating, nothing's shown beside the stars,
 * not even the rating a hovered star would give.
 */
export const RatingSystem: React.FC<RatingSystemProps> = ({ valueSide = "end", ...props }) => {
  const { configuration: config } = React.useContext(ConfigurationContext);
  const ratingSystemOptions = config?.ui.ratingSystemOptions ?? defaultRatingSystemOptions;

  if (ratingSystemOptions.type === RatingSystemType.Decimal) {
    return <RatingNumber
      value={props.value ?? null}
      onSetRating={props.onSetRating}
      disabled={props.disabled}
      clickToRate={props.clickToRate}
      withoutContext={props.withoutContext}
    />;
  } else {
    // As the stars show it: a rating too small for a star at the stars' precision (e.g. one given out of 10 with the
    // decimal system, then shown as stars) shows as none, so it's as good as not set
    const shownRating = convertToRatingFormat(props.value, ratingSystemOptions);
    return <div className={cx("rating-system-stars", `value-${valueSide}`, { "not-set": !shownRating })}>
      {/* Shown only while Stash shows no rating, which with one set is while the current rating's star is hovered */}
      <span className="clear star-rating-number">Clear</span>
      <StashRatingSystem {...props} />
    </div>;
  }
}
