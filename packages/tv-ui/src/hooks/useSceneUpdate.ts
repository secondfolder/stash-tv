import * as GQL from "stash-ui/dist/src/core/generated-graphql";

/**
 * Wrapper around useSceneUpdate that automatically adds optimistic updates
 * to the Apollo cache. This provides instant feedback to the user without
 * waiting for the network request to complete.
 *
 * @param scene - The scene object to use as the base for optimistic response
 * @returns A wrapped mutation function that adds optimisticResponse automatically
 */
export function useSceneUpdate(scene: GQL.SceneDataFragment) {
  const [mutation, mutationResult] = GQL.useSceneUpdateMutation({
    update(cache, result) {
      if (!result.data?.sceneUpdate) return;
    },
  });

  const wrappedMutation = (
    options: Parameters<typeof mutation>[0] | undefined
  ) => {
    const finalOptions = options || {};

    return mutation({
      ...finalOptions,
      optimisticResponse: {
        __typename: "Mutation" as const,
        // @ts-expect-error -- Merging the scene input and scene output types has some complex edge cases but for our
        // purposes of temporarily showing the expected updated scene in the UI this should be sufficient
        sceneUpdate: {
          __typename: "Scene" as const,
          ...scene,
          ...(finalOptions.variables?.input ?? {}),
        },
      },
    });
  };

  return [wrappedMutation, mutationResult] as const;
}
