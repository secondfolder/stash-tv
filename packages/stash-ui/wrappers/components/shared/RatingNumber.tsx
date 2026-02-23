import React, { useEffect, useMemo, useRef } from "react";
import { IRatingNumberProps } from "stash-ui/dist/src/components/Shared/Rating/RatingNumber";
import "stash-ui/dist/src/components/Shared/Rating/styles.css";
import Slider from "../../../../tv-ui/src/components/controls/slider";
import "./RatingSystem.css";
import { Button } from "react-bootstrap";
import cx from "classnames";
import "./RatingNumber.css"

export const RatingNumber: React.FC<IRatingNumberProps> = ({onSetRating, value, disabled}) => {
  const textRatingRef = React.useRef<HTMLInputElement | null>(null);

  // Focus on input on load. This should probably be configurable by a prop if this component is to be used in other places
  useEffect(() => {
    if (!textRatingRef.current) return;
    textRatingRef.current.focus()
  }, [])

  const [draftRating, setDraftRating] = React.useState<number | null>(value ?? null);
  useEffect(() => setDraftRating(value ?? null), [value]);

  const hasRating = useMemo(() =>
    typeof value === "number",
    [value]
  )


  const formattedDraftRating = useMemo(() => {
    if (draftRating === null) return "";
    return String(draftRating / 10)
      .replace(/^0*(\d)/, (match, p1) => p1) // Remove leading zeros
      .replace(/(\.\d)\d+/, (match, p1) => p1); // Limit to 1 decimal place without rounding
  }, [draftRating]);

  const handleTextRatingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputElm = e.target;
    console.log("change", inputElm.value);
    if (inputElm.value) {
      let numericValue = Number(inputElm.value)
      if (numericValue < 0 || (numericValue > 10 && numericValue < 11)) return
      if (numericValue > 11) {
        numericValue = Number(Math.floor(numericValue).toString().at(-1))
      }
      setDraftRating(Math.floor(numericValue * 10));
    } else if (inputElm.validity.valid) {
      setDraftRating(null);
    }
  }

  // Update value on unmount if changed
  const draftRatingRef = useRef<number | null>(null);
  const ratingChangedRef = useRef<boolean>(false);
  useEffect(() => {
    draftRatingRef.current = draftRating
    ratingChangedRef.current = draftRating !== value
  }, [draftRating, value]);
  useEffect(() => {
    return () => {
      if (ratingChangedRef.current) {
        onSetRating?.(draftRatingRef.current);
      }
    }
  }, [])

  const handleTextRatingBlur = () => {
    onSetRating?.(draftRating);
  }

  return (
    <div className={cx("extended-rating-number")}>
      <div className="text-rating">
        <span>
          <input
            ref={textRatingRef}
            className="text-input form-control"
            name="ratingnumber"
            type="number"
            onChange={handleTextRatingChange}
            onBlur={handleTextRatingBlur}
            value={formattedDraftRating}
            min="0.0"
            step="0.1"
            max="10"
            placeholder="0.0"
            disabled={disabled}
          />
          <span className="out-of">of 10</span>
        </span>
        {(hasRating || typeof draftRating === "number") && <Button
          variant="secondary"
          className="clear-rating"
          onClick={() => onSetRating?.(null)}
        >
          Clear
        </Button>}
      </div>
      <div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[draftRating ?? 0]}
          onValueChange={(value) => setDraftRating(value[0])}
          onValueCommit={(value) => onSetRating?.(value[0])}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
