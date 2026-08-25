import videojs, { VideoJsPlayer } from "video.js";
import {ISource as LiveISource} from "stash-ui/dist/src/components/ScenePlayer/live";
import {ISource as SourceSelectorISource} from "stash-ui/dist/src/components/ScenePlayer/source-selector";
import { MediaItem } from "../../../hooks/useMediaItems";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["stash-tv", "source-selector-access"]);

/**
 * Access to Stash's source selector plugin.
 *
 * The plugin's menu, its items and the current selection are TypeScript-private in
 * Stash's declarations but are a stable part of the plugin's runtime shape (see
 * `packages/stash-ui/stash/ui/v2.5/src/components/ScenePlayer/source-selector.ts`).
 * Stash TV drives the plugin through them to list and switch streams while reusing
 * Stash's source switching behaviour (playback position/pause state preservation and
 * error handling) rather than reimplementing it.
 */

export type StashVideoSource = LiveISource & SourceSelectorISource;

export type StashSourceMenuItem = typeof videojs.MenuItem.prototype & {
  source: StashVideoSource;
  trigger: (event: string) => void;
}

type StashSourceSelectorMenu = typeof videojs.MenuButton.prototype & {
  items: readonly StashSourceMenuItem[];
  selectedSource: StashVideoSource | null;
  setSelectedSource: (source: StashVideoSource) => void;
}

type ParsedStreamLabel = {
  fullStashLabel: string;
  format?: string;
  resolutionName?: string;
  /**
   * The resolution's numerical name (e.g. `1080p` instead of `Full HD`).
   */
  resolutionNumericalName?: string;
  height?: number;
}

// Label is omited becasue ParsedStreamLabel includes the same value in the more descriptively named `fullStashLabel` property.
export type VideoSource = Omit<StashVideoSource, "label"> & ParsedStreamLabel & {
  id: string,
}

const DIRECT_STREAM_LABEL = "Direct stream";
export const ORIGINAL_RESOLUTION_LABEL = "Original";
export const DEFAULT_STREAM_LABEL = DIRECT_STREAM_LABEL;

export const getOriginalVideoDetails = (mediaItem: MediaItem) => {
  const originalFile = mediaItem.entityType === "scene"
    ? mediaItem.entity.files?.[0]
    : mediaItem.entity.scene?.files?.[0]
  if (!originalFile) return null;
  return {
    height: originalFile.height,
    width: originalFile.width,
    path: originalFile.path,
    fileExtension: originalFile.path.match(/\/[^./]+\.([^./]+)$/)?.[1] ?? null
  }
}

const getVideoSourceFromStashVideoSource = (source: StashVideoSource, mediaItem: MediaItem): VideoSource => {
  const {height: originalVideoHeight} = getOriginalVideoDetails(mediaItem) ?? {height: 0};;
  const parsedLabel = parseStreamLabel(source.label ?? "", {originalVideoHeight});
  const {label, ...sourceWithoutLabel} = source;
  return {
    ...sourceWithoutLabel,
    ...parsedLabel,
    id: `${mediaItem.id}:${parsedLabel.fullStashLabel}`,
  };
}

/**
 * The streams available for the player's current scene, as built by Stash's ScenePlayer.
 *
 * We can't use `player.currentSources()` because stash only seems to load a single source at a time.
 * */
export function getVideoSources(player: VideoJsPlayer): VideoSource[] {
  const menu = getSourceSelectorMenu(player);
  if (!menu) return [];
  return menu.items.map(item => getVideoSourceFromStashVideoSource(item.source, player.mediaItem));
}

/**
 * We don't want the UI to list every possible source that can be played since some are essentially duplicates
 * so this filters down the list of all sources to the ones that are actually useful.
 */
export function getDisplayableVideoSources(player: VideoJsPlayer): VideoSource[] {
  const sources = getVideoSources(player);
  const {
    height: originalVideoHeight,
    fileExtension: originalVideoFileExtension,
  } = getOriginalVideoDetails(player.mediaItem) ?? {};
  const videoHasDirectStream = sources.some(isDirectStream);
  const filteredSources = sources
    // Stash will not list sources that are transcoded to a specific resolution if that resolution is greater than
    // the original video resolution but it will list them if they're the same. Since this is essentially a duplicate
    // of the list of sources with the "original" resolution they don't really add any practical value so we filter them
    // out to reduce noise.
    .filter(
      source => source.resolutionName === ORIGINAL_RESOLUTION_LABEL || source.height !== originalVideoHeight
    )
    // Also it's not likely the user would want to pick a transcoded source if there's a direct stream that has
    // the same resolution and format. So we filter those out too.
    .filter(
      source => isDirectStream(source)
        || !videoHasDirectStream
        || source.height !== originalVideoHeight
        || source.format?.toLowerCase() !== originalVideoFileExtension?.toLowerCase()
    )
  return filteredSources;
}

/**
 * When trying to switch a video to the preferred source we preference the direct stream if it matches the same
 * resoluton and format as the preferred source.
 */
export function getBestMatchingVideoSource(sourceLabel: string, player: VideoJsPlayer): VideoSource | null {
  const sources = getVideoSources(player);
  const matchingSource = sources.find(source => source.fullStashLabel === sourceLabel);
  const directSource = sources.find(source => isDirectStream(source));
  const {
    fileExtension: originalVideoFileExtension,
    height: originalVideoHeight,
  } = getOriginalVideoDetails(player.mediaItem) ?? {};
  if (
    matchingSource && directSource
    && (matchingSource.resolutionName === ORIGINAL_RESOLUTION_LABEL || matchingSource.height === originalVideoHeight)
    && matchingSource.format?.toLowerCase() === originalVideoFileExtension?.toLowerCase()
  ) {
    return directSource;
  }
  return matchingSource ?? null;
}

/** The stream currently loaded in the player, or null before sources have been set. */
export function getSelectedVideoSource(player: VideoJsPlayer): VideoSource | null {
  return getVideoSourceFromStashVideoSource(player.currentSource(), player.mediaItem)
}

function getSourceSelectorMenu(player: VideoJsPlayer): StashSourceSelectorMenu | undefined {
  if (typeof player.sourceSelector !== "function") return undefined;
  // @ts-expect-error - The plugin's type declares `menu` as private but it's third-party code
  // and there's no cleaner way to access the content we need
  return player.sourceSelector().menu as StashSourceSelectorMenu;
}

/**
 * Switches to a scene stream while preserving playback state. If the player was
 * paused before the switch, it remains paused after the new source can play.
 *
 * We use the source selector menu to change rather than calling video.js's `player.src()` directly
 * as the menu has some internal logic that is run when a selection is made. See
 * `ScenePlayer/source-selector.ts` for more details.
 */
export function switchSceneStream(player: VideoJsPlayer, source: VideoSource): boolean {
  const menu = getSourceSelectorMenu(player);
  if (!menu) {
    logger.warn(`Attempted to switch to "${source.fullStashLabel}" source but the source selector menu isn't available`);
    return false;
  };

  // Already selected in the source selector menu
  if (menu.selectedSource === source) {
    logger.info(`Attempted to switch to "${source.fullStashLabel}" source but it is already selected in the source selector menu`);
    return false;
  };

  const item = menu.items.find(item => item.source.label === source.fullStashLabel);
  if (!item) {
    logger.warn(`Attempted to switch to "${source.fullStashLabel}" but it isn't in the source selector menu`, {source, menuItems: menu.items.map(i => i.source.label)});
    return false;
  }

  const itemEl = item.el()
  if (!itemEl || !(itemEl instanceof HTMLElement)) {
    logger.warn(`Attempted to switch to "${source.fullStashLabel}" but the menu item has no html element`, {item});
    return false;
  }
  // Video.js will try to focus on the source selector menu button when we click a source so we temporarily disable
  // focus for the button.
  const originalFocus = menu.focus.bind(menu)
  menu.focus = () => {
    menu.focus = originalFocus
  }
  itemEl.click()

  return true;
}

/**
 * Whether the source is the scene's direct stream — the file served as-is — rather
 * than a remuxed/transcoded stream. Label-based: Stash's `isDirect` URL check
 * (pathname ending `/stream`, `/stream.m3u8` or `/stream.mpd`) matches every
 * HLS/DASH manifest at any resolution — the resolution is a `?resolution=` query
 * param, so it isn't part of the pathname — which is what its offset handling wants
 * but not what "the direct stream" means for display and preference purposes.
 */
export function isDirectStream(source: VideoSource): boolean {
  return source.fullStashLabel === DIRECT_STREAM_LABEL;
}

export function isPreferredStream(source: VideoSource, preferredStreamLabel: string | undefined): boolean {
  return source.fullStashLabel === (preferredStreamLabel ?? DEFAULT_STREAM_LABEL);
}

/**
 * Parses the stream labels produced by the Stash server (`internal/manager/scene.go`):
 * "Direct stream", "MKV", "{MP4|WEBM|HLS|DASH}" (original resolution) or
 * "{MP4|WEBM|HLS|DASH} {4K (2160p)|Full HD (1080p)|…}".
 */
function parseStreamLabel(
  label: string,
  {originalVideoHeight}: {originalVideoHeight: number}
): ParsedStreamLabel {
  const parsedLabel: ParsedStreamLabel = { fullStashLabel: label }
  const matchFormat = label.match(/^(Direct stream|[^\s]+)\s*(.*)$/);
  const [, format, labelRemainder] = matchFormat || [];
  if (format) {
    parsedLabel.format = format
  }
  if (labelRemainder) {
    const matchResolution = labelRemainder.match(/^([^(]+?)\s+\((\d+p)\)$/);
    const [, resolutionName, resolutionHeightStr] = matchResolution || [];
    if (resolutionName) {
      parsedLabel.resolutionName = resolutionName;
    }
    if (resolutionHeightStr) {
      const height = parseInt(resolutionHeightStr, 10);
      if (!isNaN(height)) {
        parsedLabel.height = height;
      }
    }
  } else {
    parsedLabel.resolutionName = ORIGINAL_RESOLUTION_LABEL
    parsedLabel.height = originalVideoHeight;
  }
  if (parsedLabel.height) {
    parsedLabel.resolutionNumericalName = heightToResolutionNumericalName(parsedLabel.height);
  }
  return parsedLabel;
}

export function heightToResolutionNumericalName(height: number): string {;
  if (height === 8640) return "16K";
  if (height === 4320) return "8K";
  if (height === 2880) return "5K";
  if (height === 2160) return "4K";
  return `${height}p`;
}

/**
 * Display order for stream formats within a group: the direct stream first, then
 * file containers, then adaptive streaming formats. Matches the server's own order
 * for an untouched source list.
 */
const FORMAT_DISPLAY_ORDER = ["Direct stream", "MP4", "WEBM", "MKV", "HLS", "DASH"];

function formatDisplayRank(format: string): number {
  const index = FORMAT_DISPLAY_ORDER.indexOf(format);
  // Unknown formats sort after the known ones, keeping their relative order
  return index === -1 ? FORMAT_DISPLAY_ORDER.length : index;
}

/**
 * Groups streams for display: an "Original" group first (the direct stream, MKV and
 * source-resolution transcodes — all the scene's original resolution), then one group
 * per transcode resolution, highest first. Streams within a group are sorted by
 * canonical format order so the display is stable regardless of the underlying source
 * list order — the preferred stream is applied by moving it to the front of the source
 * list, which would otherwise leak into the display order.
 */
export function groupVideoSourcesByResolution(sources: VideoSource[]): VideoSource[][] {
  const groupMap = Map.groupBy(
    sources,
    source => source.resolutionName === ORIGINAL_RESOLUTION_LABEL ? Infinity : (source.height ?? 0)
  )
  const sorted = [...groupMap.entries()]
    // The keys in groupMap are heights as numbers but Object.entries() converts them to strings
    .toSorted(([aHeight], [bHeight]) => bHeight - aHeight)
    // Return just the sources arrays but with each array sorted by format
    .map(([,sources]) => sources
      .toSorted((a, b) => formatDisplayRank(a.format ?? "") - formatDisplayRank(b.format ?? ""))
    )
  return sorted;
}

/**
 * Returns the sources with the stream matching `label` moved to the front. The
 * source selector plugin loads `sources[0]` as the default, so this is how a
 * preferred stream is applied to a scene. Returns the input array unchanged when
 * the label isn't found (e.g. the scene has no stream at that resolution) or is
 * already first.
 */
export function moveStreamToFront<T extends StashVideoSource>(sources: T[], label: string): T[] {
  const index = sources.findIndex(source => source.label === label);
  if (index <= 0) return sources;
  return [sources[index], ...sources.slice(0, index), ...sources.slice(index + 1)];
}
