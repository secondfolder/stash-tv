import React, { useEffect, useMemo } from "react";
import FeedPage from "../pages/Feed";
import { useTvConfig } from "../store/tvConfig";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import {ConfigurationProvider} from "stash-ui/dist/src/hooks/Config";
import { useViewportRotate } from "../hooks/useViewportRotate";
import { ErrorBoundary } from "stash-ui/dist/src/components/ErrorBoundary";
import { IntlProvider, CustomFormats } from "react-intl";
import englishMessages from "stash-ui/dist/src/locales/en-GB.json";
import flattenMessages from "stash-ui/dist/src/utils/flattenMessages";
import {setupLogging} from "../helpers/logging";
import FeedbackOverlay from "../components/FeedbackOverlay";
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

  const modifiedStashConfig = {
    ...stashConfig.data?.configuration,
    interface: {
      ...stashConfig.data?.configuration?.interface,
      // Stash TV has it's own autoplay setting so we don't want to have that overridden by Stash settings
      autostartVideo: false,
    }
  } as GQL.ConfigurationQuery["configuration"];

  useViewportRotate(forceLandscape);

  // We only support English for now but we have to load IntlProvider so we don't break
  // components imported from stash-ui that rely on it.
  const defaultLocale = "en-GB";
  const messages = useMemo(
    () => flattenMessages((englishMessages as unknown) as Record<string, string>),
    [englishMessages]
  );
  const language =
    stashConfig.data?.configuration?.interface?.language ?? defaultLocale;
  const intlFormats: CustomFormats = useMemo(() => ({
    date: {
      long: { year: "numeric", month: "long", day: "numeric" },
    },
  }), []);

  useDevConsoleHelpers()
  useGamepad({ forceLandscape })

  if (!tvConfigLoaded) return null

  return (
    <IntlProvider
      locale={language}
      messages={messages}
      formats={intlFormats}
    >
      <ErrorBoundary>
        <ConfigurationProvider
          configuration={modifiedStashConfig}
          loading={stashConfig.loading}
        >
          <FeedbackOverlay />
          <FeedPage />
        </ConfigurationProvider>
      </ErrorBoundary>
    </IntlProvider>
  );
};

export default App;
