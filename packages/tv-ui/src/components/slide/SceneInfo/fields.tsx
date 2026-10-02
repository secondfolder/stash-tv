import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import React, { ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FormattedDate, FormattedMessage, useIntl } from "react-intl";
import escapeStringRegexp from "escape-string-regexp";
import { getLogger } from "@logtape/logtape";
import { ChevronLeft, Eye, EyeFill, Person, PersonFill } from "react-bootstrap-icons";
import ResolutionIcon from "../../../assets/resolution.svg?react";
import cx from "classnames";
import { Button } from "react-bootstrap";
import { queryFindStudio } from "stash-ui/dist/src/core/StashService";
import { objectTitle } from "stash-ui/dist/src/core/files";
import TextUtils from "stash-ui/dist/src/utils/text";
import { ConfigurationContext } from "stash-ui/dist/src/hooks/Config";
import { defaultRatingSystemOptions, RatingSystemType } from "stash-ui/dist/src/utils/rating";
import { proxyPrefix } from "../../../constants";
import { sortPerformers } from "../../../helpers";
import { formatRating } from "../../../helpers/rating";
import { useSetRating } from "../../../hooks/rating/useSetRating";
import { useOCounter } from "../../../hooks/useOCounter";
import { RatingSystem } from "stash-ui/wrappers/components/shared/RatingSystem";
import { Tag } from "../../tags/tag";
import { SidePanel } from "../../action-buttons/ActionButtonBase";
import { OCounterControls, oCounterIcons } from "../../OCounterControls";
import {
  sceneInfoFieldLabels,
  spacerSizeLabels,
  type SceneInfoFieldId,
  type SceneInfoFieldLabelStyle,
  type SceneInfoFieldOptions,
} from "./scene-info-config";

const logger = getLogger(["stash-tv", "SceneInfo"]);

export type SceneInfoFieldProps = {
  scene: GQL.SceneDataFragment;
  /** How the fields that can be shown more than one way are shown */
  fieldOptions: SceneInfoFieldOptions;
  /**
   * Shown in one of the editor's pills to identify the field rather than in the panel, so it isn't interactive: e.g. the
   * rating's stars are disabled, and capped text isn't expandable
   */
  preview?: boolean;
  /** Whether it's one of its line's right-aligned fields */
  rightAligned?: boolean;
  onExternalLinkClick?: () => void;
}

/**
 * The icons the fields that can be labelled with one are labelled with (see `SceneInfoFieldLabelStyle`), as they are
 * with a value (`active`, e.g. the scene's been played) and without one. Their options dialog shows them too.
 */
export const sceneInfoFieldLabelIcons = {
  "play-count": { active: EyeFill, inactive: Eye },
  performers: { active: PersonFill, inactive: Person },
  "o-count": oCounterIcons,
  resolution: { active: ResolutionIcon, inactive: ResolutionIcon },
} satisfies Record<string, Record<"active" | "inactive", React.ComponentType<React.SVGProps<SVGSVGElement>>>>;

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

/**
 * A field's container. `showLabel` shows the field's name before the value, for values that don't explain themselves,
 * and `icon` an icon standing in for it.
 */
function Field({ field, showLabel, icon, className, children }: {
  field: SceneInfoFieldId, showLabel?: boolean, icon?: ReactNode, className?: string, children: ReactNode,
}) {
  return <div className={cx("field", `field-${field}`, className)}>
    {showLabel && <span className="field-label">{sceneInfoFieldLabels[field]}</span>}
    {icon && <span className="field-icon" role="img" aria-label={sceneInfoFieldLabels[field]} title={sceneInfoFieldLabels[field]}>
      {icon}
    </span>}
    {children}
  </div>
}

/**
 * The props labelling a field's value as `style` says: with its name, with its icon (`active` if it has a value), or
 * not at all
 */
function labelProps(field: keyof typeof sceneInfoFieldLabelIcons, style: SceneInfoFieldLabelStyle | "none", active: boolean) {
  if (style === "none") return {};
  if (style === "text") return { showLabel: true };
  const Icon = sceneInfoFieldLabelIcons[field][active ? "active" : "inactive"];
  return { icon: <Icon aria-hidden /> };
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

function PerformersField({ scene, fieldOptions }: SceneInfoFieldProps) {
  if (!scene.performers.length) return null;
  return <Field field="performers" {...labelProps("performers", fieldOptions.performers.label, true)}>
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
  // As Stash shows it on the scene's page
  return <Field field="date"><FormattedDate value={scene.date} format="long" timeZone="utc" /></Field>
}

/** How many lines of the details are shown until they're clicked, unless they're always shown in full */
const detailsLineCount = 3;

function DetailsField({ scene, fieldOptions, preview }: SceneInfoFieldProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const capped = !fieldOptions.details.showFullText && !expanded;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!capped || !element) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [capped, scene.details]);
  if (!scene.details) return null;
  // Expandable only if it doesn't all fit, and collapsible again once expanded
  const toggleable = !preview && (expanded || overflowing);
  return <Field field="details" className={cx({ capped, toggleable })}>
    <div
      ref={ref}
      className="details-text"
      style={capped ? { WebkitLineClamp: detailsLineCount } : undefined}
      role={toggleable ? "button" : undefined}
      tabIndex={toggleable ? 0 : undefined}
      aria-expanded={toggleable ? expanded : undefined}
      onClick={toggleable ? () => setExpanded(!expanded) : undefined}
      onKeyDown={toggleable ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setExpanded(!expanded);
      } : undefined}
    >
      {scene.details}
    </div>
  </Field>
}

/** How many rows of tags are shown until "Show N more" is clicked, unless they're all always shown */
const tagRowCount = 2;

/** The fewest tags worth hiding: a button showing fewer would take about as much room as they do */
const minHiddenTags = 2;

type TagRow = { top: number; bottom: number };

/** The rows a wrapping list's items are on, from where they're laid out (relative to the list, which is positioned) */
function measureRows(list: HTMLElement): TagRow[] {
  const rows: TagRow[] = [];
  for (const item of list.children) {
    if (!(item instanceof HTMLElement)) continue;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    const row = rows[rows.length - 1];
    if (row && top < row.bottom) row.bottom = Math.max(row.bottom, bottom);
    else rows.push({ top, bottom });
  }
  return rows;
}

/** Where the tags are cut short: the bottom of the last row shown, and how many tags are after it */
type TagCut = { bottom: number; hidden: number };

function TagsField({ scene, fieldOptions, preview }: SceneInfoFieldProps) {
  const [expanded, setExpanded] = useState(false);
  // Where they're cut short, if there are enough tags after the rows shown to be worth hiding
  const [cut, setCut] = useState<TagCut | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const capping = !fieldOptions.tags.showAll && !expanded;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!capping || !list) {
      setCut(null);
      return;
    }
    const measure = () => {
      const lastRow = measureRows(list)[tagRowCount - 1];
      const hidden = lastRow ? [...list.children].filter(tag => tag instanceof HTMLElement && tag.offsetTop >= lastRow.bottom).length : 0;
      const next = lastRow && hidden >= minHiddenTags ? { bottom: lastRow.bottom, hidden } : null;
      setCut(previous => previous?.bottom === next?.bottom && previous?.hidden === next?.hidden ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [capping, scene.tags]);
  if (!scene.tags.length) return null;
  const capped = capping && cut;
  const showMore = capped && `Show ${cut.hidden} more`;
  return <Field field="tags" className={cx({ capped })}>
    {/* Cut short after the last row shown, every row shown in full */}
    <div ref={listRef} className="tag-list" style={capped ? { maxHeight: cut.bottom } : undefined}>
      {scene.tags.map(tag => (
        <a key={tag.id} href={getStashUrl(`/tags/${tag.id}`)} target="_blank">
          <Tag tag={tag} />
        </a>
      ))}
    </div>
    {capped && (preview
      ? <span className="show-more btn btn-link btn-sm">{showMore}</span>
      : <Button variant="link" size="sm" className="show-more" onClick={() => setExpanded(true)}>{showMore}</Button>
    )}
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

function RatingField({ scene, fieldOptions, preview, rightAligned }: SceneInfoFieldProps) {
  const { configuration: stashConfig } = useContext(ConfigurationContext);
  const ratingSystemType = (stashConfig?.ui.ratingSystemOptions ?? defaultRatingSystemOptions).type;
  const setRating = useSetRating(scene);
  // As a control, shown without a rating too, so one can be given
  if (fieldOptions.rating.display === "control") {
    return <Field field="rating">
      {/* Its rating (or "Clear") on the side away from the fields beside it, so the stars stay put as it changes */}
      <RatingSystem
        value={scene.rating100}
        onSetRating={setRating}
        clickToRate
        disabled={preview}
        valueSide={rightAligned ? "start" : "end"}
      />
    </Field>
  }
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

function ResolutionField({ scene, fieldOptions }: SceneInfoFieldProps) {
  const file = scene.files[0];
  if (!file?.width || !file?.height) return null;
  const { label, format } = fieldOptions.resolution;
  return <Field field="resolution" {...labelProps("resolution", label, true)}>
    {format === "dimensions" ? `${file.width}×${file.height}` : TextUtils.resolution(file.width, file.height)}
  </Field>
}

function FrameRateField({ scene }: SceneInfoFieldProps) {
  const intl = useIntl();
  const frameRate = scene.files[0]?.frame_rate;
  if (!frameRate) return null;
  // Stash's own wording, e.g. "30 fps"
  return <Field field="frame-rate">
    <FormattedMessage id="frames_per_second" values={{ value: intl.formatNumber(frameRate) }} />
  </Field>
}

function PlayCountField({ scene, fieldOptions }: SceneInfoFieldProps) {
  const { label } = fieldOptions["play-count"];
  const playCount = scene.play_count ?? 0;
  // With its icon, shown before the scene's been played too, its outline saying so
  if (!playCount && label === "text") return null;
  return <Field field="play-count" {...labelProps("play-count", label, playCount > 0)}>{playCount}</Field>
}

function OCountField(props: SceneInfoFieldProps) {
  const { scene, fieldOptions } = props;
  const { display, label } = fieldOptions["o-count"];
  if (display === "control") return <OCountControlField {...props} />;
  const oCount = scene.o_counter ?? 0;
  // With its icon, shown at 0 too, its outline saying so, as the play count's is
  if (!oCount && label === "text") return null;
  return <Field field="o-count" {...labelProps("o-count", label, oCount > 0)}>{oCount}</Field>
}

/**
 * The o-count as a button marking an orgasm, as the o-counter action button does: clicked, it increments the o-count,
 * and its icon turns solid. Clicked again, it shows the controls for changing the o-count.
 */
function OCountControlField({ scene, preview }: SceneInfoFieldProps) {
  const oCounter = useOCounter(scene);
  const state = oCounter.incremented ? "active" : "inactive";
  const Icon = oCounterIcons[state];
  const content = <>
    <Icon className="o-counter-icon" aria-hidden />
    {oCounter.count}
  </>;
  if (preview) return <Field field="o-count" className="o-count-control">{content}</Field>;
  return <Field field="o-count" className="o-count-control">
    <SidePanel content={<OCounterControls oCounter={oCounter} />} placement="top">
      {({ onClick, ref }) => <button
        type="button"
        ref={ref}
        className={cx("o-counter-button", `state-${state}`)}
        aria-label={oCounter.incremented ? "Change O-count" : "Mark Orgasm"}
        onClick={event => oCounter.incremented ? onClick(event) : oCounter.increment()}
      >
        {content}
      </button>}
    </SidePanel>
  </Field>
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

/**
 * Space between fields: beside them on a line, or, alone on its line (with the line's other fields showing nothing),
 * above and below (see SceneInfo.css). In the editor's pills it's named, as there's nothing else to see.
 */
function SpacerField({ fieldOptions, preview }: SceneInfoFieldProps) {
  const { size } = fieldOptions.spacer;
  if (preview) return <Field field="spacer" className="spacer-preview">{spacerSizeLabels[size]} spacer</Field>;
  return <Field field="spacer" className={`spacer-${size}`}><span aria-hidden /></Field>;
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
  "frame-rate": FrameRateField,
  "play-count": PlayCountField,
  "o-count": OCountField,
  path: PathField,
  urls: UrlsField,
  spacer: SpacerField,
} satisfies Record<SceneInfoFieldId, React.FC<SceneInfoFieldProps>>;
