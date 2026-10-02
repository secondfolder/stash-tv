import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import React, { ReactNode, useContext, useEffect, useState } from "react";
import escapeStringRegexp from "escape-string-regexp";
import { getLogger } from "@logtape/logtape";
import { ChevronLeft } from "react-bootstrap-icons";
import cx from "classnames";
import { queryFindStudio } from "stash-ui/dist/src/core/StashService";
import { objectTitle } from "stash-ui/dist/src/core/files";
import TextUtils from "stash-ui/dist/src/utils/text";
import { ConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { defaultRatingSystemOptions, RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { proxyPrefix } from "../../../constants";
import { sortPerformers } from "../../../helpers";
import { formatRating } from "../../../helpers/rating";
import { Tag } from "../../tags/tag";
import { sceneInfoFieldLabels, type SceneInfoFieldId } from "./scene-info-config";

const logger = getLogger(["stash-tv", "SceneInfo"]);

export type SceneInfoFieldProps = {
  scene: GQL.SceneDataFragment;
  onExternalLinkClick?: () => void;
}

/** Renders one of the panel's fields, or nothing if the scene doesn't have a value for it */
export function SceneInfoField({ field, ...props }: SceneInfoFieldProps & { field: SceneInfoFieldId }) {
  const Value = sceneInfoFieldComponents[field];
  return <Value {...props} />;
}

export const getStashUrl = (path: string) => {
  if (!import.meta.env.STASH_ADDRESS) return path;
  const url = new URL(path, import.meta.env.STASH_ADDRESS);
  return url.toString();
}

/** A field's container. `showLabel` shows the field's name before the value, for values that don't explain themselves. */
function Field({ field, showLabel, children }: { field: SceneInfoFieldId, showLabel?: boolean, children: ReactNode }) {
  return <div className={cx("field", `field-${field}`)}>
    {showLabel && <span className="field-label">{sceneInfoFieldLabels[field]}</span>}
    {children}
  </div>
}

/** Joins items into a sentence, e.g. "A and B" or "A, B, and C" */
function joinAsSentence(items: ReactNode[]) {
  return items.map((item, i) => {
    let suffix = null;
    if (items.length === 2 && i === 0) suffix = " and ";
    else if (i === items.length - 2) suffix = ", and ";
    else if (i < items.length - 2) suffix = ", ";
    return <React.Fragment key={i}>{item}{suffix}</React.Fragment>;
  });
}

/* --------------------------------- Studio --------------------------------- */

type Studio = Exclude<GQL.SceneDataFragment["studio"], null | undefined>

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

function StudioField({ scene }: SceneInfoFieldProps) {
  const [studioOwnershipChain, setStudioOwnershipChain] = useState<Studio[]>(scene.studio ? [scene.studio] : []);

  useEffect(() => {
    (async () => {
      if (!scene.studio) return;
      const chain = await getStudioOwnershipChain(scene.studio);
      setStudioOwnershipChain(chain);
    })();
  }, [scene.studio]);

  if (!scene.studio) return null;
  return <Field field="studio">
    {studioOwnershipChain
      .map((studio, i) => {
        const renderedStudio = (
          <a
            key={studio.id}
            href={getStashUrl(`/studios/${studio.id}`)}
            target="_blank"
          >
            {studio.name}
          </a>
        )
        return i > 0
          ? [
            <ChevronLeft
              className="separator"
              key={i}
            />,
            renderedStudio
          ]
          : renderedStudio
      })
      .flat()
    }
  </Field>
}

/* ---------------------------------- Title --------------------------------- */

function TitleField({ scene, onExternalLinkClick }: SceneInfoFieldProps) {
  let sceneUrl = scene.paths.stream?.split("/stream")[0]?.replace("/scene", "/scenes")
  if (sceneUrl && import.meta.env.STASH_ADDRESS) {
    const scenePath = new URL(sceneUrl).pathname.replace(new RegExp(`^${escapeStringRegexp(proxyPrefix)}`), "");
    sceneUrl = getStashUrl(scenePath);
  }
  return <Field field="title">
    <a href={sceneUrl || ""} target="_blank" onClick={onExternalLinkClick}>
      <h5>
        {objectTitle(scene)}
      </h5>
    </a>
  </Field>
}

/* ------------------------------- Performers ------------------------------- */

function PerformersField({ scene }: SceneInfoFieldProps) {
  if (!scene.performers.length) return null;
  return <Field field="performers">
    {joinAsSentence(sortPerformers(scene.performers).map(performer => (
      <a href={getStashUrl(`/performers/${performer.id}`)} target="_blank">
        {performer.name}
      </a>
    )))}
  </Field>
}

/* ---------------------------------- Other --------------------------------- */

function DateField({ scene }: SceneInfoFieldProps) {
  if (!scene.date) return null;
  return <Field field="date">{scene.date}</Field>
}

function DetailsField({ scene }: SceneInfoFieldProps) {
  if (!scene.details) return null;
  return <Field field="details">{scene.details}</Field>
}

function TagsField({ scene }: SceneInfoFieldProps) {
  if (!scene.tags.length) return null;
  return <Field field="tags">
    {scene.tags.map(tag => (
      <a key={tag.id} href={getStashUrl(`/tags/${tag.id}`)} target="_blank">
        <Tag tag={tag} />
      </a>
    ))}
  </Field>
}

function GroupsField({ scene }: SceneInfoFieldProps) {
  if (!scene.groups.length) return null;
  return <Field field="groups" showLabel>
    {joinAsSentence(scene.groups.map(({ group }) => (
      <a href={getStashUrl(`/groups/${group.id}`)} target="_blank">
        {group.name}
      </a>
    )))}
  </Field>
}

function CodeField({ scene }: SceneInfoFieldProps) {
  if (!scene.code) return null;
  return <Field field="code" showLabel>{scene.code}</Field>
}

function DirectorField({ scene }: SceneInfoFieldProps) {
  if (!scene.director) return null;
  return <Field field="director" showLabel>{scene.director}</Field>
}

function RatingField({ scene }: SceneInfoFieldProps) {
  const { configuration: stashConfig } = useContext(ConfigurationContext);
  const ratingSystemType = (stashConfig?.ui.ratingSystemOptions ?? defaultRatingSystemOptions).type;
  if (typeof scene.rating100 !== "number") return null;
  const outOf = ratingSystemType === RatingSystemType.Stars ? 5 : 10;
  return <Field field="rating" showLabel>
    {formatRating(scene.rating100, ratingSystemType)} / {outOf}
  </Field>
}

function DurationField({ scene }: SceneInfoFieldProps) {
  const duration = scene.files[0]?.duration;
  if (!duration) return null;
  return <Field field="duration" showLabel>
    {TextUtils.secondsToTimestamp(duration)}
  </Field>
}

function ResolutionField({ scene }: SceneInfoFieldProps) {
  const file = scene.files[0];
  if (!file?.width || !file?.height) return null;
  return <Field field="resolution" showLabel>
    {TextUtils.resolution(file.width, file.height)} ({file.width}×{file.height})
  </Field>
}

function PlayCountField({ scene }: SceneInfoFieldProps) {
  if (!scene.play_count) return null;
  return <Field field="play-count" showLabel>{scene.play_count}</Field>
}

function OCountField({ scene }: SceneInfoFieldProps) {
  if (!scene.o_counter) return null;
  return <Field field="o-count" showLabel>{scene.o_counter}</Field>
}

function PathField({ scene }: SceneInfoFieldProps) {
  const path = scene.files[0]?.path;
  if (!path) return null;
  return <Field field="path">{path}</Field>
}

function UrlsField({ scene }: SceneInfoFieldProps) {
  if (!scene.urls.length) return null;
  return <Field field="urls">
    {scene.urls.map(url => (
      <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>
    ))}
  </Field>
}

const sceneInfoFieldComponents = {
  studio: StudioField,
  title: TitleField,
  performers: PerformersField,
  date: DateField,
  details: DetailsField,
  tags: TagsField,
  groups: GroupsField,
  code: CodeField,
  director: DirectorField,
  rating: RatingField,
  duration: DurationField,
  resolution: ResolutionField,
  "play-count": PlayCountField,
  "o-count": OCountField,
  path: PathField,
  urls: UrlsField,
} satisfies Record<SceneInfoFieldId, React.FC<SceneInfoFieldProps>>;
