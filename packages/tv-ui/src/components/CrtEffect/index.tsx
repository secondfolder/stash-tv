// Based off: https://codepen.io/GLITCHXploitR/pen/OxGKrq

import "./CrtEffect.scss";
import React, { useEffect, useMemo, useRef, useState } from "react";
import cx from "classnames";
import { animate, useMotionValue, motion, MotionValue, Subscriber, useAnimation, useSpring } from "framer-motion";

type Props = {
  enabled?: boolean;
  children?: React.ReactNode;
  strength?: number;
  infoText?: string;
};

export default function CrtEffect({strength = 1, infoText = "AV-1", ...props}: Props) {
  const strengthDiscreet = Math.round(strength * 5);
  const enabled = props.enabled ?? true;
  const [tvState, setTvState] = useState<"off" | "on" | "turning-off" | "turning-on">("off")
  useEffect(() => {
    if (enabled) {
      if (tvState !== "on") {
        setTvState("turning-on")
        const timeoutId = setTimeout(() => setTvState("on"), 1000)
        return () => clearTimeout(timeoutId)
      }
    } else {
      if (tvState !== "off") {
        setTvState("turning-off")
        const timeoutId = setTimeout(() => setTvState("off"), 750)
        return () => clearTimeout(timeoutId)
      }
    }
  }, [props.enabled])

  const rootElmRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const rootElm = rootElmRef.current
    const canvasElm = rootElm?.querySelector('canvas')
    if (!canvasElm) return
    const windowWidth = window.innerWidth;
    let frame: number;

    // Set canvas size
    canvasElm.width = windowWidth / 3;
    canvasElm.height = (windowWidth * 0.5625) / 3;

    // Generate CRT noise
    function snow(canvasElm: HTMLCanvasElement) {
      const canvasContext = canvasElm.getContext('2d')
      if (!canvasContext) return

      var w = canvasContext.canvas.width,
        h = canvasContext.canvas.height,
        d = canvasContext.createImageData(w, h),
        b = new Uint32Array(d.data.buffer),
        len = b.length;

      for (var i = 0; i < len; i++) {
        b[i] = ((255 * Math.random()) | 0) << 24;
      }

      canvasContext.globalAlpha = 0.4;
      canvasContext.putImageData(d, 0, 0);
    }

    function animate() {
      if (!canvasElm) return;
      snow(canvasElm);
      frame = requestAnimationFrame(animate);
    }

    const timeoutId = setTimeout(animate, 1000);
    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(frame);
    };
  }, []);


  useEffect(() => {
    const rootElm = rootElmRef.current
    if (!rootElm) return

    rootElm.style.setProperty('--strength', strength.toString());
    rootElm.style.setProperty('--strength-discreet', strengthDiscreet.toString());
  }, [strength])

  const smoothInsetX = useSpring(0)
  const smoothInsetY = useSpring(0)

  useEffect(() => {
    smoothInsetX.onChange((insetX) => {
      const rootElm = rootElmRef.current
      if (!rootElm) return
      rootElm.style.setProperty('--crt-inset-right', `${insetX}px`);
      rootElm.style.setProperty('--crt-inset-left', `${insetX}px`);
      rootElm.style.setProperty('--crt-inset-x', `${insetX}px`);
    })
    smoothInsetY.onChange((insetY) => {
      const rootElm = rootElmRef.current
      if (!rootElm) return
      rootElm.style.setProperty('--crt-inset-top', `${insetY}px`);
      rootElm.style.setProperty('--crt-inset-bottom', `${insetY}px`);
      rootElm.style.setProperty('--crt-inset-y', `${insetY}px`);
    })
  }, [smoothInsetX, smoothInsetY])

  useEffect(() => {
    const rootElm = rootElmRef.current
    if (!rootElm) return

    // Observe root element resize to set custom properties
    const rootResizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        const insetPercent = enabled ? 0.01 + (0.01 * strength) : 0; // 2% inset on each side
        const insetY = height * insetPercent;
        const insetX = width * insetPercent;

        smoothInsetX.set(insetX);
        smoothInsetY.set(insetY);
      }
    });
    rootResizeObserver.observe(rootElm);

    const contentElm = rootElm?.querySelector('.content')

    // Observe content element resize
    let contentResizeObserver: ResizeObserver | undefined;
    if (contentElm) {
      contentResizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          setContentHeight(entry.contentRect.height);
        }
      });
      contentResizeObserver.observe(contentElm);
    }

    return () => {
      rootResizeObserver.disconnect();
      contentResizeObserver?.disconnect();
    }
  }, [enabled, strength, smoothInsetX, smoothInsetY])

  const glitchedBandsCount = 14
  const glitchedBandsMaxXOffset = 20 * (strength - 0.76) * (1/(1 - 0.76))
  const glitchedBandsHeight = 2
  const glitchSpikePoint = 0.2
  const [contentHeight, setContentHeight] = useState(0)
  const glitchHeight = glitchedBandsCount * glitchedBandsHeight
  const glitchTravelSpeed = 20 // px/s
  const glitchedBandsYOffset = useMotionValue(-glitchHeight)

  useEffect(() => {
    const animation = animate(-glitchHeight, contentHeight, {
      duration: (contentHeight + glitchHeight) / glitchTravelSpeed,
      repeat: Infinity,
      repeatType: "loop",
      repeatDelay: 5,
      onUpdate: (value) => glitchedBandsYOffset.set(value),
      ease: "linear",
    });

    return () => animation.stop();
  }, [contentHeight]);

  /**
   * Glitch-style spike-dip-decay function
   * - Sharp dip below 0
   * - Sharp spike above 0
   * - Slowly decays back toward 0, reaching near 0 at tEnd
   *
   * @param {number} t - time since the glitch started
   * @param {number} amplitude - maximum deviation
   * @param {number} spikeDuration - duration of the initial spike-dip
   * @param {number} tEnd - time at which the decay should be approximately 0
   * @param {number} epsilon - threshold for "effectively 0" (optional, default 0.01*amplitude)
   * @returns {number} value at time t
   */
  function glitchSpike(t: number, amplitude = 1, spikeDuration = 0.05, tEnd = 15, epsilon = 0.01) {
    const pi = Math.PI;

    if (t < spikeDuration) {
      // spike-dip phase: sine from -1 to 1
      const spike = Math.sin((t / spikeDuration) * pi * 2); // -1 -> 1
      return spike * amplitude;
    } else {
      // Calculate decayRate so the value reaches ~0 at tEnd
      const decayRate = (tEnd - spikeDuration) / Math.log(amplitude / epsilon);
      // Exponential decay from the maximum spike
      return amplitude * Math.exp(-(t - spikeDuration) / decayRate);
    }
  }

  return (
    <div className={cx("CrtEffect", `strength-${strengthDiscreet}`, `tv-${tvState}`, { "disabled": !enabled && tvState !== "turning-off" })} ref={rootElmRef}>
      <div className="pixel-matrix">
        <div className="signal">
          <div className="content">
            {props.children}
          </div>
          <div className="text">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i}>
                {infoText}
              </span>
            ))}
          </div>
          <canvas className="noise"></canvas>
        </div>
      </div>
      <div className="physical-screen"></div>
      <svg width="0" height="0" style={{position: "absolute"}}>
        <filter id="lineShift" x="0" y="0" width="100%" height="100%">
          {strength >= 0.8 && <>
            {/* Create masks for each scan line we're going to offset*/}
            <feFlood floodColor="black" result="black" />
            <feFlood floodColor="white" result="white" />
            {new Array(glitchedBandsCount).fill(null).map((_, i) => (
              <motion.feComposite
                in="white"
                in2="black"
                operator="over"
                x="0"
                y={mapMotionValue(glitchedBandsYOffset, val => Math.floor(val) + (i * glitchedBandsHeight))}
                // width="100%" // For some reason in chrome if specify a percentage here it ignores the other side
                // attributes but if we leave it off it defaults to 100% which is what we want anyway
                height={glitchedBandsHeight}
                result={`bandMask${i + 1}`}
                key={i}
              />
            ))}
            {/* Hide the section in the signal where the bands are so that where they are offset is transparent */}
            <motion.feComposite
              in="white"
              in2="black"
              operator="over"
              x="0"
              y={mapMotionValue(glitchedBandsYOffset, val => Math.floor(val))}
              // width="100%" // Same as the comment for width above
              height={glitchHeight}
              result={`allBandsMask`}
            />
            <feComposite
              in="SourceGraphic"
              in2="allBandsMask"
              operator="out"
              result="maskedSource"
            />
            {/* Create scan line from mask */}
            {new Array(glitchedBandsCount).fill(null).map((_, i) => (
              <feComposite
              in={`SourceGraphic`}
              in2={`bandMask${glitchedBandsCount - i}`}
              operator="in"
              result={`scanline${i + 1}`}
              key={i}
              />
            ))}
            {/* Offset scanlines horizontally */}
            {new Array(glitchedBandsCount).fill(null).map((_, i) => (
              <feOffset
                in={`scanline${i + 1}`}
                dx={glitchSpike(glitchedBandsCount - i, glitchedBandsMaxXOffset, glitchedBandsCount * glitchSpikePoint, glitchedBandsCount, 0.9)}
                dy="0"
                key={i}
                result={`scanline${i + 1}`}
              />
            ))}
            {/* Composite the shifted band back over original */}
            {new Array(glitchedBandsCount).fill(null).map((_, i) => (
              <feComposite
                in={`scanline${i + 1}`}
                in2={i === 0 ? "maskedSource" : `output`}
                operator="over"
                result="output"
                key={i}
              />
            ))}
          </>}
        </filter>
      </svg>
    </div>
  );
}

function mapMotionValue<Value extends any>(motionValue: MotionValue<Value>, transformFunc: (value: Value) => Value) {
  return new Proxy(motionValue, {
    get(target, prop, receiver) {
      if (prop === "get") {
        return () => transformFunc(target.get());
      }
      if (prop === "onRenderRequest") {
        return (callback: Subscriber<Value>) => {
          // onRenderRequest is not typed but has the same signature as onChange so we use it's signature
          return target[prop as "onChange"](
            (value) => callback(transformFunc(value))
          )
        }
      }
      if (prop === "onChange") {
        return (callback: Subscriber<Value>) => {
          return target[prop](
            (value) => callback(transformFunc(value))
          )
        }
      }
      return Reflect.get(target, prop, receiver);
    }
  })
}
