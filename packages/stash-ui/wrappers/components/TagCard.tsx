import React from "react";
import { TagCard as TagCardSource } from "stash-ui/dist/src/components/Tags/TagCard";
import "stash-ui/dist/src/components/Tags/styles.css";
import { WithBrowserRouter } from "../helpers/WithBrowserRouter";
export * from "stash-ui/dist/src/components/Tags/TagCard";

export function TagCard(props: React.ComponentProps<typeof TagCardSource>) {
  return (
    <WithBrowserRouter>
      <TagCardSource {...props} />
    </WithBrowserRouter>
  );
}
