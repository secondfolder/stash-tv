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
  const numMarks = (
    (
      (sliderProps.max || 1) - (sliderProps.min || 0)
    )
    /
    (sliderProps.step || 1)
  ) + 1;
  return (
    <RadixSlider.Root className="Slider" {...sliderProps}>
      <div className="slider-body">
        <RadixSlider.Track className="track">
          <RadixSlider.Range className="range" />
          {marks && <div className="marks">
            {new Array(numMarks).fill(0).map((_, i) => (
              <div className="mark" key={i} style={{ left: `${(i / (numMarks - 1)) * 100}%` }} />
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
