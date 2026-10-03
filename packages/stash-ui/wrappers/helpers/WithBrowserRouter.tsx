import React, { ReactNode, useMemo } from "react";
import { Router } from "react-router-dom";
import { createBrowserHistory } from "history";

/** Stash components with links in them (react-router `Link`s) must be rendered in a router */
export function WithBrowserRouter({ children }: { children: ReactNode }) {
  const history = useMemo(() => createBrowserHistory(), []);
  return <Router history={history}>{children}</Router>;
}
