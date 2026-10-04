import React, { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { AppIntlProvider } from "../../../src/app/AppIntlProvider";
import { MediaItemStateContextProvider } from "../../../src/store/mediaItemState";

/**
 * Render a component as it is on a slide: with the react-intl context Stash's components need, the slide's own
 * state, and an Apollo client for Stash's hooks that never answers (so nothing here may need Stash's data). The
 * providers stay put when it's rerendered.
 */
export function renderOnSlide(ui: ReactElement) {
  const OnSlide = ({ children }: { children?: ReactNode }) => (
    <MockedProvider>
      <AppIntlProvider>
        <MediaItemStateContextProvider>{children}</MediaItemStateContextProvider>
      </AppIntlProvider>
    </MockedProvider>
  );
  return render(ui, { wrapper: OnSlide });
}
