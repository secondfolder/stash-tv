import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import "./SceneInfo.css"
import React, { forwardRef, useState } from "react";
import escapeStringRegexp from "escape-string-regexp";
import { proxyPrefix } from "../../../constants";
import { sortPerformers } from "../../../helpers";
import cx from "classnames";
import { queryFindStudio } from "stash-ui/dist/src/core/StashService";
import { getLogger } from "@logtape/logtape";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft } from "@fortawesome/free-solid-svg-icons";

export type Props = {
  style?: React.CSSProperties;
  scene: GQL.TvSceneDataFragment;
  className?: string;
  onExternalLinkClick?: () => void;
}

const logger = getLogger(["stash-tv", "SceneInfo"]);

const SceneInfo = forwardRef(({scene, className, style, onExternalLinkClick}: Props, ref: React.ForwardedRef<HTMLDivElement>) => {
    /* ---------------------------------- Date ---------------------------------- */

    const date = scene.date ? (
      <span className="date">{scene.date}</span>
    ) : null;

    /* ------------------------------- Performers ------------------------------- */

    const sortedPerformers = sortPerformers(scene.performers);
    const totalPerformers = sortedPerformers.length;

    const performersInner = sortedPerformers.map((pf, i) => {
      const isOneBeforeLast = i === totalPerformers - 2;
      const isAnyBeforeLast = i < totalPerformers - 1;
      let suffix = null;
      if (totalPerformers === 2 && isOneBeforeLast) suffix = " and ";
      else {
        if (isAnyBeforeLast) suffix = ", ";
        if (isOneBeforeLast) suffix += "and ";
      }
      return (
        <React.Fragment key={i}>
          <span>{pf.name}</span>
          {suffix}
        </React.Fragment>
      );
    });

    const performers = performersInner.length ? (
      <div className="performers">{performersInner}</div>
    ) : null;

    /* --------------------------------- Studio --------------------------------- */

    type Studio = Exclude<GQL.TvSceneDataFragment["studio"], null | undefined>

    const getStudioOwnershipChain = async (studio: Studio): Promise<Studio[]> => {
      const chain = [studio];
      let currentStudio = studio;
      while (currentStudio?.parent_studio) {
        const {data, error} = await queryFindStudio(currentStudio.parent_studio.id);
        if (error) {
          logger.error("Error fetching parent studio:", error);
          break;
        }
        const parentStudio = data?.findStudio;
        if (!parentStudio) break;
        chain.push(parentStudio);
        currentStudio = parentStudio;
      }
      return chain;
    }

    const [studioOwnershipChain, setStudioOwnershipChain] = useState<Studio[]>(scene.studio ? [scene.studio] : []);

    React.useEffect(() => {
      (async () => {
        if (!scene.studio) return;
        const chain = await getStudioOwnershipChain(scene.studio);
        setStudioOwnershipChain(chain);
      })();
    }, [scene.studio]);

    const studio = scene.studio ? (
      <span className="studio">
        {studioOwnershipChain
          .map((studio, i) => {
            const renderedStudio = (
              <a
                key={studio.id}
                href={new URL(`/studios/${studio.id}`, import.meta.env.STASH_ADDRESS).toString()}
                target="_blank"
              >
                {studio.name}
              </a>
            )
            return i > 0
              ? [
                <FontAwesomeIcon
                  className="separator"
                  icon={faAngleLeft}
                  key={i}
                />,
                renderedStudio
              ]
              : renderedStudio
          })
          .flat()
        }
      </span>
    ) : null;

    /* ---------------------------------- Title --------------------------------- */

    const title = scene.title ? <h5>{scene.title}</h5> : null;
    let sceneUrl = scene.paths.stream?.split("/stream")[0]?.replace("/scene", "/scenes")
    if (sceneUrl && import.meta.env.STASH_ADDRESS) {
      const scenePath = new URL(sceneUrl).pathname.replace(new RegExp(`^${escapeStringRegexp(proxyPrefix)}`), "");
      sceneUrl = new URL(scenePath, import.meta.env.STASH_ADDRESS).toString()
    }

    /* -------------------------------- Component ------------------------------- */

    return (
      <div
        className={cx("SceneInfo", "hide-on-ui-hide", className)}
        data-testid="MediaSlide--sceneInfo"
        style={style}
        ref={ref}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {studio}
        <a href={sceneUrl || ""} target="_blank" onClick={onExternalLinkClick}>{title}</a>
        {performers}
        {date}
      </div>
    );
  }
);

export default SceneInfo
