import React, { useEffect, useMemo } from "react";
import { RatingSystem as StashRatingSystem, IRatingSystemProps } from "stash-ui/dist/src/components/Shared/Rating/RatingSystem";
import { RatingNumber as StashRatingNumber, IRatingNumberProps } from "stash-ui/dist/src/components/Shared/Rating/RatingNumber";
import "stash-ui/dist/src/components/Shared/Rating/styles.css";
import { ConfigurationContext } from "../../../dist/src/hooks/Config";
import { defaultRatingSystemOptions, RatingSystemType } from "../../../dist/src/utils/rating";
import Slider from "../../../../tv-ui/src/components/controls/slider";
import "./RatingSystem.css";
import { Button } from "react-bootstrap";
import cx from "classnames";
import { createPortal } from "react-dom";
import "./RatingNumber.css"

export const RatingNumber: React.FC<IRatingNumberProps> = ({clickToRate = true, ...otherProps}) => {
  const rootElm = React.useRef<HTMLDivElement | null>(null);
  const stashRatingNumberRootElm = React.useRef<HTMLDivElement | null>(null);
  const [rootElmReady, setRootElmReady] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);

  const [sliderDraftRating, setSliderDraftRating] = React.useState<number | null>(otherProps.value ?? null);
  useEffect(() => setSliderDraftRating(otherProps.value ?? null), [otherProps.value]);

  const hasRating = useMemo(() =>
    typeof otherProps.value === "number",
    [otherProps.value]
  )

  useEffect(() => {
    if (!rootElm.current) return
    stashRatingNumberRootElm.current = rootElm.current.querySelector(".rating-number") as HTMLDivElement | null;
    if (!stashRatingNumberRootElm.current) return;

    const observer = new MutationObserver((mutations) => {
      const editButton = mutations
        .map(
          mutation => Array.from(mutation.addedNodes)
            .find(
              elm => elm instanceof HTMLElement && elm.classList.contains("edit-rating-button")
            ) as HTMLButtonElement | undefined
        )
        .filter(Boolean)[0];
      if (editButton) {
        if (clickToRate) {
          editButton.addEventListener("click", () => setIsEditing(true));
          setIsEditing(false);
        } else {
          editButton.click()
        }

      }
    });
    observer.observe(stashRatingNumberRootElm.current, { childList: true });

    const editButton = stashRatingNumberRootElm.current.querySelector(".edit-rating-button") as HTMLButtonElement | null;
    if (editButton) {
      editButton.addEventListener("click", () => setIsEditing(true));
      if (!clickToRate) {
        editButton.click()
      }
    };
    return () => observer.disconnect();
  }, [])

  return (
    <div
      className={cx("extended-rating-number", {"has-rating": hasRating, "editing": isEditing})}
      ref={rootElm}
    >
      <div className="text-rating">
        <span>
          {!hasRating && !isEditing && "No rating set"}
          <StashRatingNumber
            {...otherProps}
            // We force clickToRate since without it RatingNumber will set the rating with every key stroke and that
            // causes the value passed to it to change which can reformat the number `3` -> `3.0` and that causes the
            // cursor to jump to the end of the input which is a bad experience when trying to type `3.5`.
            clickToRate={true}
            // We set this to slider's draft rating so that we can see the slider value change immediately when dragged. Since
            // the draft value will be updated when the actual rating value changes, this will still remain in sync if changed
            // via StashRatingNumber's input field.
            value={sliderDraftRating}
          />
          {(hasRating || isEditing) && `of 10.0`}
        </span>
        {(hasRating || typeof sliderDraftRating === "number") && <Button
          variant="secondary"
          className="clear-rating"
          onClick={() => otherProps.onSetRating?.(null)}
        >
          Clear
        </Button>}
      </div>
      <div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[sliderDraftRating ?? 0]}
          onValueChange={(value) => {
            setIsEditing(true);
            setSliderDraftRating(value[0])
          }}
          onValueCommit={(value) => {
            if (clickToRate) {
              setIsEditing(false);
            }
            otherProps.onSetRating?.(value[0])
          }}
          disabled={otherProps.disabled}
        />
      </div>
    </div>
  )
}
