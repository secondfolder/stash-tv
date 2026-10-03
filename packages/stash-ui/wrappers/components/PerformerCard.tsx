import React from "react";
import { PerformerCard as PerformerCardSource } from "stash-ui/dist/src/components/Performers/PerformerCard";
import "stash-ui/dist/src/components/Performers/styles.css";
import { WithBrowserRouter } from "../helpers/WithBrowserRouter";
export * from "stash-ui/dist/src/components/Performers/PerformerCard";

export function PerformerCard(props: React.ComponentProps<typeof PerformerCardSource>) {
  return (
    <WithBrowserRouter>
      <PerformerCardSource {...props} />
    </WithBrowserRouter>
  );
}
