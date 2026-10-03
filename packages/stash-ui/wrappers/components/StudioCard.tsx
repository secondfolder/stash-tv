import React from "react";
import { StudioCard as StudioCardSource } from "stash-ui/dist/src/components/Studios/StudioCard";
import "stash-ui/dist/src/components/Studios/styles.css";
import { WithBrowserRouter } from "../helpers/WithBrowserRouter";
export * from "stash-ui/dist/src/components/Studios/StudioCard";

export function StudioCard(props: React.ComponentProps<typeof StudioCardSource>) {
  return (
    <WithBrowserRouter>
      <StudioCardSource {...props} />
    </WithBrowserRouter>
  );
}
