import React, { useEffect } from "react";
import FeedPage from "../pages/Feed";
import { useTvConfig } from "../store/tvConfig";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import {ConfigurationProvider} from "stash-ui/dist/src/hooks/Config";
import { useViewportRotate } from "../hooks/useViewportRotate";
import { useBrowserZoomResetOnViewportChange } from "../hooks/useBrowserZoomResetOnViewportChange";
import { ErrorBoundary } from "stash-ui/dist/src/components/ErrorBoundary";
import { AppIntlProvider } from "./AppIntlProvider";
import {setupLogging} from "../helpers/logging";
import FeedbackOverlay from "../components/FeedbackOverlay";
import NewVersionNotice from "../components/NewVersionNotice";
import { useDevConsoleHelpers } from "../hooks/useDevConsoleHelpers";
import { useGlobalState } from "../store/globalState";
import { useGamepad } from "../hooks/useGamepad";

await setupLogging()

const App = () => {
  const { forceLandscape, logLevel, loggersToShow, loggersToHide } = useTvConfig()
  const { tvConfigLoaded } = useGlobalState()
  useEffect(() => {
    setupLogging({logLevel, logCategoriesToShow: loggersToShow, logCategoriesToHide: loggersToHide});
  }, [logLevel, loggersToShow, loggersToHide]);

  const stashConfig = GQL.useConfigurationQuery();

  // Undefined until Stash's configuration has loaded (as Stash's own app provides it), so components fall back to
  // Stash's defaults. A partial configuration would crash those that read a section of it, like `general`
  const loadedStashConfig = stashConfig.data?.configuration;
  const modifiedStashConfig = loadedStashConfig && {
    ...loadedStashConfig,
    interface: {
      ...loadedStashConfig.interface,
      // Stash TV has it's own autoplay setting so we don't want to have that overridden by Stash settings
      autostartVideo: false,
    }
  };

  useViewportRotate(forceLandscape);
  useBrowserZoomResetOnViewportChange();

  const language = stashConfig.data?.configuration?.interface?.language ?? undefined;

  useDevConsoleHelpers()
  useGamepad({ forceLandscape })

  if (!tvConfigLoaded) return null

  return (
    <AppIntlProvider locale={language}>
      <ErrorBoundary>
        <ConfigurationProvider
          configuration={modifiedStashConfig}
          loading={stashConfig.loading}
        >
          <FeedbackOverlay />
          <NewVersionNotice />
          <FeedPage />
        </ConfigurationProvider>
      </ErrorBoundary>
    </AppIntlProvider>
  );
};

export default App;
