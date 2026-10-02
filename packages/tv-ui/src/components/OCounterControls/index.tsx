import "./OCounterControls.css";
import React from "react";
import cx from "classnames";
import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import SplashIcon from '../../assets/splash.svg?react';
import SplashOutlineIcon from '../../assets/splash-outline.svg?react';
import type { useOCounter } from "../../hooks/useOCounter";

/** The o-counter's icon: solid once the scene's been marked since the slide was shown, an outline until then */
export const oCounterIcons = {
  active: SplashIcon,
  inactive: SplashOutlineIcon,
};

/** Buttons decreasing and increasing a scene's o-count, either side of it */
export function OCounterControls({ oCounter, className }: { oCounter: ReturnType<typeof useOCounter>, className?: string }) {
  return <div className={cx("OCounterControls", className)}>
    <button onClick={() => oCounter.decrement()} disabled={oCounter.count <= 0} aria-label="Decrease O-count">
      <FontAwesomeIcon icon={faMinus} />
    </button>
    {oCounter.count}
    <button onClick={() => oCounter.increment()} aria-label="Increase O-count">
      <FontAwesomeIcon icon={faPlus} />
    </button>
  </div>
}
