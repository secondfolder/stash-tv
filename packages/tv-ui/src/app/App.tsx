import React, { useEffect } from "react";
import FeedPage from "../pages/Feed";
import { useTvConfig } from "../store/tvConfig";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import {ConfigurationProvider} from "stash-ui/dist/src/hooks/Config";
import { ToastProvider } from "stash-ui/dist/src/hooks/Toast";
import { ErrorMessage } from "stash-ui/dist/src/components/Shared/ErrorMessage";
import { LoadingIndicator } from "stash-ui/wrappers/components/shared/LoadingIndicator";
import { FormattedMessage } from "react-intl";
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
        {/* Stash's components (e.g. its marker form) report what they've done, and errors, with toasts */}
        <ToastProvider>
          <FeedbackOverlay />
          <NewVersionNotice />
          {modifiedStashConfig ? (
            <ConfigurationProvider configuration={modifiedStashConfig}>
              <FeedPage />
            </ConfigurationProvider>
          ) : stashConfig.error ? (
            // Stash's components need its configuration, so as in Stash's own app there's no feed without it
            <ErrorMessage
              message={<FormattedMessage id="errors.loading_type" values={{ type: "configuration" }} />}
              error={stashConfig.error.message}
            />
          ) : (
            <LoadingIndicator />
          )}
        </ToastProvider>
      </ErrorBoundary>
    </AppIntlProvider>
  );
};

export default App;
