import { useMemo } from "react";
import { END_POSITION_OPTIONS, PlaybackPositionLabelContext, START_POSITION_OPTIONS } from "../constants";
import { formatDuration } from "../helpers";
import { useTvConfig } from "../store/tvConfig";

type LabelSource = string | ((context: PlaybackPositionLabelContext) => string)

type WithResolvedLabels<Option> = Omit<Option, "label" | "shortLabel"> & { label: string, shortLabel: string }

function resolveLabel(label: LabelSource, context: PlaybackPositionLabelContext) {
  return typeof label === "function" ? label(context) : label
}

/** Replaces any function `label`s and `shortLabel`s in `options` with the string they produce for `context`. */
export function resolvePlaybackPositionLabels<Option extends { label: LabelSource, shortLabel: LabelSource }>(
  options: readonly Option[],
  context: PlaybackPositionLabelContext,
): WithResolvedLabels<Option>[] {
  return options.map(option => ({
    ...option,
    label: resolveLabel(option.label, context),
    shortLabel: resolveLabel(option.shortLabel, context),
  }))
}

/**
 * The start and end point options with labels and short labels that describe the current settings (e.g. the fixed play
 * length), ready to display.
 */
// The explicit return type stops a type cycle: tvConfig's types depend on the action button definitions,
// whose titles use this hook.
export function usePlaybackPositionOptions(): {
  startPositionOptions: WithResolvedLabels<typeof START_POSITION_OPTIONS[number]>[],
  endPositionOptions: WithResolvedLabels<typeof END_POSITION_OPTIONS[number]>[],
} {
  const { playLength } = useTvConfig();

  return useMemo(() => {
    const context: PlaybackPositionLabelContext = {
      // Without a play length the full scene plays.
      formattedDuration: playLength ? formatDuration(playLength) : "full length",
    };
    return {
      startPositionOptions: resolvePlaybackPositionLabels(START_POSITION_OPTIONS, context),
      endPositionOptions: resolvePlaybackPositionLabels(END_POSITION_OPTIONS, context),
    };
  }, [playLength]);
}
