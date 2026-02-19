import * as React from "react";
import * as RadixSlider from "@radix-ui/react-slider";
import "./Slider.css";

const Slider = (props: RadixSlider.SliderProps) => (
  <RadixSlider.Root className="Slider" defaultValue={[50]} max={100} step={1} {...props}>
    <RadixSlider.Track className="track">
      <RadixSlider.Range className="range" />
    </RadixSlider.Track>
    <RadixSlider.Thumb className="thumb" aria-label="Volume" />
  </RadixSlider.Root>
);

export default Slider;
