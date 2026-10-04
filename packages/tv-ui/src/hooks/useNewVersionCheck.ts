import { gql, TypedDocumentNode, useApolloClient } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getLogger } from "@logtape/logtape";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { PLUGIN_NAMESPACE } from "../constants";

const logger = getLogger(["stash-tv", "NewVersionCheck"]);

/** The version in package.json and source.yml until a release sets the real one */
export const unreleasedVersion = "0.0.0-version-set-when-releasing";

/** The least time between checks, however often the app is brought back to the foreground */
export const newVersionCheckInterval = 60 * 1000;

const PluginVersionDocument: TypedDocumentNode<{ plugins: Pick<GQL.Plugin, "id" | "version">[] | null }> = gql`
  query StashTvPluginVersion {
    plugins {
      id
      version
    }
  }
`;

/**
 * Checks whether the version of Stash TV installed in Stash differs from the one running, when the app starts and
 * whenever it's brought back to the foreground.
 *
 * @see docs/app-updates.md
 */
export function useNewVersionCheck() {
  const client = useApolloClient();
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const lastCheckTime = useRef<number>();

  useEffect(() => {
    const runningVersion = import.meta.env.VITE_STASH_TV_VERSION;
    if (import.meta.env.DEV || !runningVersion || runningVersion === unreleasedVersion) return;

    let unmounted = false;
    const check = async () => {
      if (lastCheckTime.current !== undefined && Date.now() - lastCheckTime.current < newVersionCheckInterval) return;
      lastCheckTime.current = Date.now();
      try {
        const { data } = await client.query({ query: PluginVersionDocument, fetchPolicy: "network-only" });
        const installedVersion = data.plugins?.find(plugin => plugin.id === PLUGIN_NAMESPACE)?.version;
        if (unmounted) return;
        setNewVersion(installedVersion && installedVersion !== runningVersion ? installedVersion : null);
      } catch (error) {
        logger.debug("Couldn't check for a new version: {error}", { error });
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };
    // iOS can restore the page from its back/forward cache without making it visible again
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check();
    };

    check();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      unmounted = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [client]);

  const dismiss = useCallback(() => setDismissedVersion(newVersion), [newVersion]);

  return {
    /** The installed version, if it isn't the one running and hasn't been dismissed */
    newVersion: newVersion !== dismissedVersion ? newVersion : null,
    dismiss,
  };
}
