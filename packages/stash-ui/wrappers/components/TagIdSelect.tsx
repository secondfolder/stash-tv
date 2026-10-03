import React from "react";
import { TagIDSelect as TagIdSelectSource } from "stash-ui/dist/src/components/Tags/TagSelect";
import "stash-ui/dist/src/components/Tags/styles.css";
import { WithBrowserRouter } from "../helpers/WithBrowserRouter";
export * from "stash-ui/dist/src/components/Tags/TagSelect";
import { Props as ReactSelectProps } from "react-select";

type Props = React.ComponentProps<typeof TagIdSelectSource> & ReactSelectProps;

export function TagIdSelect(props: Props) {
  return (
    <WithBrowserRouter>
      <TagIdSelectSource
        {...props}
      />
    </WithBrowserRouter>
  );
}
