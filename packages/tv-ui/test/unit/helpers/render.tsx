import React, { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { buildConfiguration, createDefaultFixtures, createStore } from "mock-stash";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { ConfigurationProvider } from "stash-ui/dist/src/hooks/Config";
import { ToastProvider } from "stash-ui/dist/src/hooks/Toast";
import { AppIntlProvider } from "../../../src/app/AppIntlProvider";
import { MediaItemStateContextProvider } from "../../../src/store/mediaItemState";

/**
 * Stash's configuration as a fresh install gives it (mock-stash's, as integration tests get). Stash's components
 * throw without one, as do ours that read it, so the app only renders them once Stash's has loaded.
 *
 * @see docs/state-and-config.md § "The `tvConfigLoaded` Guard"
 */
export const freshStashConfiguration = buildConfiguration(
  createStore(createDefaultFixtures())
) as unknown as GQL.ConfigDataFragment;

/** Provide Stash's configuration (by default a fresh install's) as the app does once it has loaded */
export function WithStashConfiguration({
  configuration = freshStashConfiguration,
  children,
}: {
  configuration?: GQL.ConfigDataFragment;
  children?: ReactNode;
}) {
  return <ConfigurationProvider configuration={configuration}>{children}</ConfigurationProvider>;
}

/**
 * Render a component as it is on a slide: with the react-intl context and toasts Stash's components need, Stash's
 * configuration, the slide's own state, and an Apollo client for Stash's hooks that never answers (so nothing here may need Stash's
 * data). The providers stay put when it's rerendered.
 */
export function renderOnSlide(ui: ReactElement) {
  const OnSlide = ({ children }: { children?: ReactNode }) => (
    <MockedProvider>
      <AppIntlProvider>
        <ToastProvider>
          <WithStashConfiguration>
            <MediaItemStateContextProvider>{children}</MediaItemStateContextProvider>
          </WithStashConfiguration>
        </ToastProvider>
      </AppIntlProvider>
    </MockedProvider>
  );
  return render(ui, { wrapper: OnSlide });
}
