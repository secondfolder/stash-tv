import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { useSceneUpdate } from "../useSceneUpdate";

export function useSetRating(scene: GQL.SceneDataFragment) {
  const [updateScene] = useSceneUpdate(scene);
  function setRating(newRating: number | null) {
    updateScene({
      variables: {
        input: {
          id: scene.id,
          rating100: newRating,
        },
      },
    });
  }

  return setRating;
}
