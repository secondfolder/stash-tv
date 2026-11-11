import React, { ReactNode, useEffect, useState } from "react";
import { Spinner } from "react-bootstrap";
import cx from "classnames";
import { Building, GeoAltFill, HeartFill, Search, TagFill, XLg } from "react-bootstrap-icons";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import TextUtils from "stash-ui/dist/src/utils/text";
import TvChannelOutlineIcon from "../../assets/tv-channel-outline.svg?react";
import { CommandPalette, type CommandPaletteItem } from "../CommandPalette";
import { useGlobalState } from "../../store/globalState";
import { useTvConfig } from "../../store/tvConfig";
import { setActiveChannel, showTemporaryFilter, useMediaItemFilters } from "../../hooks/useMediaItemFilters";
import { onShortcut } from "../../helpers/shortcut-actions/input";
import { useFeedback } from "../FeedbackOverlay";
import { getChannelName, TEMPORARY_CHANNEL_ID, type ChannelConfig, type TemporaryFilter } from "../channels/channel-config";
import { makeEntityFilter, makeSearchFilter } from "../channels/temporary-filter";
import { useSearchResults } from "./useSearchResults";
import type { SearchPerformer, SearchStudio, SearchTag } from "./search-queries";
import "./SearchPalette.scss";

/**
 * The search palette: typing into it suggests a search for the text itself (for scenes or markers), and the channels,
 * performers, tags and studios it matches. Picking one shows it in the feed, in the temporary channel (always replacing
 * whatever it showed), except a channel, which the feed switches to. Enter picks the first, searching scenes for the
 * text. Opened by the search action button, or the `search` shortcut (`/`).
 *
 * @see docs/search.md
 */
export function SearchPalette() {
  const { searchOpen, set: setGlobalState } = useGlobalState();
  const [query, setQuery] = useState("");

  useEffect(() => onShortcut("press", (trigger) => {
    if (!trigger.match(["search"])) return;
    // So the key isn't typed into the palette's field once it has focus (and Firefox's quick find doesn't open on `/`)
    trigger.preventDefault();
    setGlobalState("searchOpen", true);
  }), [setGlobalState]);

  const close = () => {
    setGlobalState("searchOpen", false);
    // It's empty the next time it's opened
    setQuery("");
  };

  const results = useSearchResults(query);
  const items = useSearchItems(query, results, close);
  const nothingFound = !results.loading && !!query.trim() && items.every((item) => item.group === undefined);

  return <CommandPalette
    show={searchOpen}
    onClose={close}
    label="Search"
    placeholder="Search scenes, markers, performers, tags…"
    className="SearchPalette"
    query={query}
    onQueryChange={setQuery}
    inputPrefix={<Search aria-hidden />}
    actions={query ? [{ label: "Clear", icon: <XLg aria-hidden />, onClick: () => setQuery(""), focusInput: true }] : []}
    items={items}
    status={
      results.errors.length ? <span className="text-danger">Couldn't search: {results.errors[0].message}</span>
      : results.loading ? <span className="search-palette-loading text-muted"><Spinner animation="border" size="sm" /> Searching…</span>
      : nothingFound ? <span className="text-muted">No channels, performers, tags or studios match.</span>
      : null
    }
  />;
}

/** What's typed, in bold where it is in the text (the first time, ignoring case) */
function withMatch(text: string, query: string): ReactNode {
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index === -1) return text;
  return <>
    {text.slice(0, index)}
    <strong className="search-match">{text.slice(index, index + query.length)}</strong>
    {text.slice(index + query.length)}
  </>;
}

/** An alias matching what's typed, to show why an entity whose name doesn't is suggested */
function matchingAlias(name: string, aliases: string[], query: string) {
  const lowerQuery = query.toLowerCase();
  if (name.toLowerCase().includes(lowerQuery)) return undefined;
  return aliases.find((alias) => alias.toLowerCase().includes(lowerQuery));
}

/** Stash gives an entity without an image of its own a placeholder, marked `default=true` */
const hasOwnImage = (imagePath: string | null | undefined): imagePath is string =>
  !!imagePath && !imagePath.includes("default=true");

function count(number: number, noun: string) {
  return `${number} ${noun}${number === 1 ? "" : "s"}`;
}

/** A suggestion's label: its name, with a line of details under it */
function SuggestionLabel({ name, details }: { name: ReactNode; details?: ReactNode }) {
  return <span className="search-suggestion">
    <span className="search-suggestion-name">{name}</span>
    {details && <span className="search-suggestion-details text-muted">{details}</span>}
  </span>;
}

const joinDetails = (...details: (string | null | undefined | false)[]) => details.filter(Boolean).join(" · ");

/**
 * The palette's results for what's typed: searching for the text itself first, then what it matches, grouped by kind
 */
function useSearchItems(
  query: string,
  { performers, tags, studios, searched }: ReturnType<typeof useSearchResults>,
  close: () => void,
): CommandPaletteItem[] {
  const text = query.trim();
  const channels = useTvConfig((state) => state.channels);
  const { activeChannel, availableSavedFilters, availableSavedFiltersLoading } = useMediaItemFilters();
  const { setFeedback } = useFeedback();

  if (!text) return [];

  const channelLabel = (channel: ChannelConfig) => {
    const { prefix, name } = getChannelName(channel, availableSavedFilters, availableSavedFiltersLoading);
    return prefix + name;
  };

  const showFilter = (filter: TemporaryFilter) => {
    showTemporaryFilter(filter);
    close();
    const temporaryChannel = useTvConfig.getState().channels.find((channel) => channel.id === TEMPORARY_CHANNEL_ID);
    if (temporaryChannel) setFeedback(channelLabel(temporaryChannel), { displayDuration: 3000 });
  };

  const searchItems: CommandPaletteItem[] = [
    {
      id: "search-scenes",
      icon: <SuggestionIcon><Search /></SuggestionIcon>,
      label: <SuggestionLabel name={<>Scenes matching “<strong className="search-match">{text}</strong>”</>} />,
      onSelect: () => showFilter(makeSearchFilter(GQL.FilterMode.Scenes, text)),
    },
    {
      id: "search-markers",
      icon: <SuggestionIcon><GeoAltFill /></SuggestionIcon>,
      label: <SuggestionLabel name={<>Markers matching “<strong className="search-match">{text}</strong>”</>} />,
      onSelect: () => showFilter(makeSearchFilter(GQL.FilterMode.SceneMarkers, text)),
    },
  ];

  const channelItems = channels
    .map((channel) => ({ channel, label: channelLabel(channel) }))
    .filter(({ label }) => label.toLowerCase().includes(text.toLowerCase()))
    .map(({ channel, label }): CommandPaletteItem => {
      const source = channel.sources[0];
      const kind = source?.type === "stash-saved-filter" ? "Saved filter" : source?.type === "temporary-filter" ? "Temporary" : undefined;
      return {
        id: `channel-${channel.id}`,
        group: "Channels",
        icon: <SuggestionIcon><TvChannelOutlineIcon /></SuggestionIcon>,
        label: <SuggestionLabel name={withMatch(label, text)} details={joinDetails(kind, source?.randomise && "Random order")} />,
        description: channel.id === activeChannel?.id ? "Showing" : undefined,
        onSelect: () => {
          setActiveChannel(channel.id);
          close();
          setFeedback(label, { displayDuration: 3000 });
        },
      };
    });

  const performerItems = performers.map((performer): CommandPaletteItem => ({
    id: `performer-${performer.id}`,
    group: "Performers",
    // Without an image of their own, Stash's placeholder (a silhouette), as Stash shows it
    icon: <Thumbnail kind="performer" imagePath={performer.image_path} keepPlaceholder />,
    label: <SuggestionLabel
      name={<>
        {withMatch(performer.name, searched)}
        {performer.disambiguation && <span className="text-muted"> ({performer.disambiguation})</span>}
        {performer.favorite && <HeartFill className="search-favorite" role="img" aria-label="Favourite" />}
      </>}
      details={performerDetails(performer, searched)}
    />,
    description: count(performer.scene_count, "scene"),
    onSelect: () => showFilter(makeEntityFilter("performer", performer)),
  }));

  const tagItem = (tag: SearchTag, markers: boolean): CommandPaletteItem => ({
    id: `${markers ? "tag-markers" : "tag"}-${tag.id}`,
    group: markers ? "Markers by tag" : "Tags",
    icon: <Thumbnail kind="tag" imagePath={tag.image_path} fallback={<TagFill />} />,
    label: <SuggestionLabel
      name={<span className="tag-item badge badge-secondary">{withMatch(tag.name, searched)}</span>}
      details={tagDetails(tag, searched)}
    />,
    description: markers ? count(tag.scene_marker_count, "marker") : count(tag.scene_count, "scene"),
    onSelect: () => showFilter(makeEntityFilter("tag", tag, markers ? GQL.FilterMode.SceneMarkers : GQL.FilterMode.Scenes)),
  });

  const studioItems = studios.map((studio): CommandPaletteItem => ({
    id: `studio-${studio.id}`,
    group: "Studios",
    icon: <Thumbnail kind="studio" imagePath={studio.image_path} fallback={<Building />} />,
    label: <SuggestionLabel name={withMatch(studio.name, searched)} details={studioDetails(studio, searched)} />,
    description: count(studio.scene_count, "scene"),
    onSelect: () => showFilter(makeEntityFilter("studio", studio)),
  }));

  return [
    ...searchItems,
    ...channelItems,
    ...performerItems,
    ...tags.map((tag) => tagItem(tag, false)),
    ...tags.filter((tag) => tag.scene_marker_count > 0).map((tag) => tagItem(tag, true)),
    ...studioItems,
  ];
}

function performerDetails(performer: SearchPerformer, query: string) {
  const alias = matchingAlias(performer.name, performer.alias_list, query);
  if (alias) return <>Also “{withMatch(alias, query)}”</>;
  const age = performer.birthdate ? TextUtils.age(performer.birthdate, performer.death_date ?? undefined) : undefined;
  return joinDetails(performer.country, age !== undefined && String(age));
}

function tagDetails(tag: SearchTag, query: string) {
  const alias = matchingAlias(tag.name, tag.aliases, query);
  if (alias) return <>Also “{withMatch(alias, query)}”</>;
  return tag.parents[0] ? `In ${tag.parents[0].name}` : undefined;
}

function studioDetails(studio: SearchStudio, query: string) {
  const alias = matchingAlias(studio.name, studio.aliases, query);
  if (alias) return <>Also “{withMatch(alias, query)}”</>;
  return studio.parent_studio?.name;
}

/** A suggestion's icon, in a box the size of a thumbnail so suggestions' names line up */
function SuggestionIcon({ children }: { children: ReactNode }) {
  return <span className="search-thumbnail icon" aria-hidden>{children}</span>;
}

/**
 * An entity's image, shaped for its kind (a performer's is portrait, a studio's a logo). Without one of its own, the
 * fallback (e.g. an icon), unless `keepPlaceholder`, which shows the placeholder Stash gives it
 */
function Thumbnail({ kind, imagePath, fallback, keepPlaceholder = false }: {
  kind: "performer" | "tag" | "studio";
  imagePath?: string | null;
  fallback?: ReactNode;
  keepPlaceholder?: boolean;
}) {
  const showImage = keepPlaceholder ? !!imagePath : hasOwnImage(imagePath);
  return <span className={cx("search-thumbnail", kind, { icon: !showImage })} aria-hidden>
    {showImage && imagePath ? <img src={imagePath} alt="" loading="lazy" /> : fallback}
  </span>;
}
