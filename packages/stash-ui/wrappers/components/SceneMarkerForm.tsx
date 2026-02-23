import React, { useMemo } from "react";
import { SceneMarkerForm as OriginalSceneMarkerForm} from "stash-ui/dist/src/components/Scenes/SceneDetails/SceneMarkerForm";
import { Router } from "react-router-dom";
import { createBrowserHistory } from "history";
import cx from "classnames";
import "./SceneMarkerForm.css";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";

type Props = Omit<React.ComponentProps<typeof OriginalSceneMarkerForm>, "marker"> & {
  marker?: GQL.SceneMarkerDataFragment;
  className?: string;
};

export const SceneMarkerForm = function ({className, ...originalSceneMarkerFormProps}: Props) {
  const history = useMemo(() => createBrowserHistory(), []);
  return (
    <Router history={history}>
      <div className={cx("SceneMarkerForm", className)}>
        <OriginalSceneMarkerForm
          {...originalSceneMarkerFormProps}
        />
      </div>
    </Router>
  );
}
