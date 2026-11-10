import React from "react";
import { TagIDSelect as TagIdSelectSource, type TagSelectProps } from "stash-ui/dist/src/components/Tags/TagSelect";
import "stash-ui/dist/src/components/Tags/styles.css";
import { WithBrowserRouter } from "../helpers/WithBrowserRouter";
export * from "stash-ui/dist/src/components/Tags/TagSelect";
import { Props as ReactSelectProps } from "react-select";

// TagIDSelect passes its props on to TagSelect, so it takes TagSelect's own props too, though its type leaves them out
type Props = React.ComponentProps<typeof TagIdSelectSource>
  & Pick<TagSelectProps, "hoverPlacement" | "hoverPlacementLabel" | "excludeIds">
  & ReactSelectProps;

export function TagIdSelect(props: Props) {
  return (
    <WithBrowserRouter>
      <TagIdSelectSource
        {...props}
      />
    </WithBrowserRouter>
  );
}
