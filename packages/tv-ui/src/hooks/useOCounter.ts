import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { useEffect } from "react";
import { useSceneDecrementO, useSceneIncrementO } from "stash-ui/dist/src/core/StashService";
import { useMediaItemState } from "../store/mediaItemState";

/**
 * A scene's o-count and the means to change it, shared by everything on a slide that marks orgasms (the o-counter
 * action button and the scene info panel's o-count). `incremented` is whether it's been marked since the slide was
 * shown, which they show with a solid icon rather than an outline.
 */
export function useOCounter(scene: GQL.SceneDataFragment) {
  const { preIncrementOCounterValue, set: setMediaItemState } = useMediaItemState()
  const count = scene.o_counter ?? 0
  const incremented = count > preIncrementOCounterValue
  const [increment] = useSceneIncrementO(scene.id);
  const [removeOCountTime] = useSceneDecrementO(scene.id);
  const decrement = () => {
    // o_history appears to already be sorted newest to oldest but we sort anyway to be sure that's always the case
    const latestOHistoryTime = scene.o_history?.toSorted().reverse()[0]
    if (latestOHistoryTime) {
      removeOCountTime({
        variables: {
          id: scene.id,
          times: [latestOHistoryTime],
        },
      })
    }
  }
  // If we've decremented the oCount below that of preIncrementOCounterValue then update preIncrementOCounterValue
  // so that the button only needs to be clicked twice before the side panel is shown again. In an effect, as it updates
  // the slide's store, which everything using it re-renders for. Until it runs, the scene simply isn't shown as marked,
  // its count not being above where it started.
  const oCount = scene.o_counter;
  useEffect(() => {
    if (typeof oCount === "number" && oCount < preIncrementOCounterValue) {
      setMediaItemState("preIncrementOCounterValue", oCount)
    }
  }, [oCount, preIncrementOCounterValue])
  return { count, incremented, increment: () => increment(), decrement }
}
