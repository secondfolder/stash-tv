import React from "react";
import { TagSelect as TagSelectSource, TagSelectProps } from "stash-ui/dist/src/components/Tags/TagSelect";
import "stash-ui/dist/src/components/Tags/styles.css";
import { WithBrowserRouter } from "../helpers/WithBrowserRouter";
export * from "stash-ui/dist/src/components/Tags/TagSelect";
import { Props as ReactSelectProps } from "react-select";

export function TagSelect(props: TagSelectProps & ReactSelectProps) {
  return (
    <WithBrowserRouter>
      <TagSelectSource
        {...props}
      />
    </WithBrowserRouter>
  );
}
