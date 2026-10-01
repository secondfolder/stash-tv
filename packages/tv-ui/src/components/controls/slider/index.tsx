import * as React from "react";
import * as RadixSlider from "@radix-ui/react-slider";
import "./Slider.css";

type props = RadixSlider.SliderProps & {
  marks?: boolean;
  onThumbMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onThumbMouseUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

const Slider = (props: props) => {
  const { marks, onThumbMouseDown, onThumbMouseUp, ...sliderProps } = props;
  // Radix's defaults, for props that aren't given. `??` rather than `||`, so a max or min of 0 is kept.
  const { min = 0, max = 100, step = 1 } = sliderProps;
  // A step of 0 or less would never reach max, so treat the range as one step
  // (the tolerance stops floating point error dropping a mark, e.g. 0.3 / 0.1 is 2.9999999999999996)
  const numMarks = (step > 0 ? Math.floor((max - min) / step + 1e-9) : 1) + 1;
  return (
    <RadixSlider.Root className="Slider" {...sliderProps}>
      <div className="slider-body">
        <RadixSlider.Track className="track">
          <RadixSlider.Range className="range" />
          {marks && <div className="marks">
            {new Array(numMarks).fill(0).map((_, i) => (
              // Guard the divisor: a single mark (min === max) has no span to
              // divide by, and would otherwise render at left: NaN%
              <div className="mark" key={i} style={{ left: `${(i / Math.max(numMarks - 1, 1)) * 100}%` }} />
            ))}
          </div>}
        </RadixSlider.Track>
        <RadixSlider.Thumb
          className="thumb"
          aria-label="Volume"
          onPointerDown={onThumbMouseDown}
          onPointerUp={onThumbMouseUp}
        />
      </div>
    </RadixSlider.Root>
  )
}

export default Slider;
