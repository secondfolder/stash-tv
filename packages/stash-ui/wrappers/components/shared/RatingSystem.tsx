import React from "react";
import { RatingSystem as StashRatingSystem, IRatingSystemProps } from "stash-ui/dist/src/components/Shared/Rating/RatingSystem";
import "stash-ui/dist/src/components/Shared/Rating/styles.css";
import { ConfigurationContext } from "../../../dist/src/hooks/Config";
import { defaultRatingSystemOptions, RatingSystemType } from "../../../dist/src/utils/rating";
import "./RatingSystem.css";
import { RatingNumber } from "./RatingNumber";

export const RatingSystem: React.FC<IRatingSystemProps> = (props) => {
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
    return <StashRatingSystem {...props} />;
  }
}
