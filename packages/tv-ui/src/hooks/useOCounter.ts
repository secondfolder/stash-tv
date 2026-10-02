import * as GQL from "stash-ui/dist/src/core/generated-graphql";
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
  // so that the button only needs to be clicked twice before the side panel is shown again.
  if (typeof scene.o_counter === "number" && scene.o_counter < preIncrementOCounterValue) {
    setMediaItemState("preIncrementOCounterValue", scene.o_counter)
  }
  return { count, incremented, increment: () => increment(), decrement }
}
