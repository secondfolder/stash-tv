import React, { useContext } from "react";
import { ConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { defaultRatingSystemOptions, RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { RatingSystem } from "stash-ui/wrappers/components/shared/RatingSystem";
import { formatRating } from "../../../../helpers/rating";
import { useSetRating } from "../../../../hooks/rating/useSetRating";
import { choice, OptionsOf } from "../field-options";
import { defineField, Field, SceneInfoFieldProps } from "./shared";

const schema = {
  /** As Stash's rating stars (or number), which set the rating, or as text */
  display: choice({ control: "Rating control", text: "Text" }, "control", {
    label: "Show as",
    description: "The rating control sets the scene's rating, and shows even when it has none.",
  }),
};

function RatingField({ scene, options, preview, rightAligned }: SceneInfoFieldProps<OptionsOf<typeof schema>>) {
  const { configuration: stashConfig } = useContext(ConfigurationContext);
  const ratingSystemType = (stashConfig?.ui.ratingSystemOptions ?? defaultRatingSystemOptions).type;
  const setRating = useSetRating(scene);
  // As a control, shown without a rating too, so one can be given
  if (options.display === "control") {
    return <Field field={fieldDefinition}>
      {/* Its rating (or "Clear") on the side away from the fields beside it, so the stars stay put as it changes */}
      <RatingSystem
        value={scene.rating100}
        onSetRating={setRating}
        clickToRate
        disabled={preview}
        valueSide={rightAligned ? "start" : "end"}
      />
    </Field>
  }
  if (typeof scene.rating100 !== "number") return null;
  const outOf = ratingSystemType === RatingSystemType.Stars ? 5 : 10;
  return <Field field={fieldDefinition} showLabel>
    {formatRating(scene.rating100, ratingSystemType)} / {outOf}
  </Field>
}

export const fieldDefinition = defineField({ id: "rating", label: "Rating", component: RatingField, options: schema });
