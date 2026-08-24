import { VideoJsPlayer } from "video.js";

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

/** The source objects stored by the source selector plugin (Stash's `ISource`). */
export interface SceneStreamSource {
  src: string;
  type?: string;
  label?: string;
  errored?: boolean;
}

interface SourceMenuItem {
  source: SceneStreamSource;
  trigger: (event: string) => void;
}

interface SourceSelectorMenu {
  items: readonly SourceMenuItem[];
  selectedSource: SceneStreamSource | null;
  setSelectedSource: (source: SceneStreamSource) => void;
}

interface SourceSelectorPlugin {
  menu: SourceSelectorMenu;
}

const DIRECT_STREAM_LABEL = "Direct stream";

function getSourceSelectorMenu(player: VideoJsPlayer): SourceSelectorMenu | undefined {
  if (typeof player.sourceSelector !== "function") return undefined;
  // The plugin's type declares `menu` as private, so its runtime shape is re-applied
  // here, once, at the access boundary.
  const plugin = player.sourceSelector() as unknown as SourceSelectorPlugin;
  return plugin.menu;
}

/** The streams available for the player's current scene, as built by Stash's ScenePlayer. */
export function getSceneStreamOptions(player: VideoJsPlayer): SceneStreamSource[] {
  const menu = getSourceSelectorMenu(player);
  if (!menu) return [];
  return menu.items.map(item => item.source);
}

/** The stream currently loaded in the player, or null before sources have been set. */
export function getSelectedSceneStream(player: VideoJsPlayer): SceneStreamSource | null {
  return getSourceSelectorMenu(player)?.selectedSource ?? null;
}

/**
 * Switch the player to the given stream. The source must come from
 * {@link getSceneStreamOptions} for the same player.
 *
 * Triggering the item's `selected` event runs Stash's full source switching
 * behaviour: playback position and pause state are preserved across the switch and
 * the selection is treated as manual, which stops the plugin's error fallback from
 * overriding it.
 *
 * Returns false when the stream isn't available on the player (e.g. the plugin
 * hasn't been given the scene's sources yet).
 */
export function selectSceneStream(player: VideoJsPlayer, source: SceneStreamSource): boolean {
  const menu = getSourceSelectorMenu(player);
  if (!menu) return false;
  // Already playing - matching the menu items, which don't re-trigger when selected
  if (menu.selectedSource === source) return true;
  const item = menu.items.find(item => item.source === source);
  if (!item) return false;
  item.trigger("selected");
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
export function isDirectStream(source: SceneStreamSource): boolean {
  return source.label === DIRECT_STREAM_LABEL;
}

/**
 * A compact label for the source: format and resolution when present (e.g. "HLS
 * 1080p" from "HLS Full HD (1080p)"), otherwise the full label (e.g. "MKV").
 */
export function getShortStreamLabel(source: SceneStreamSource): string {
  const { codec, height } = parseStreamLabel(source.label ?? "");
  if (height) return `${codec} ${height}`;
  return source.label ?? "";
}

export interface SceneStreamGroup {
  /** Unique id for the group: a resolution height (e.g. "1080p") or "direct" / "original". */
  id: string;
  /** Header label for the group (e.g. "Direct stream", "Original", "1080p"). */
  label: string;
  sources: SceneStreamSource[];
}

interface ParsedStreamLabel {
  /** The codec/format part of the label (e.g. "HLS", "Direct stream"). */
  codec: string;
  /** The resolution height (e.g. "1080p"), absent for non-transcoded streams. */
  height?: string;
}

/**
 * Parses the stream labels produced by the Stash server (`internal/manager/scene.go`):
 * "Direct stream", "MKV", "{MP4|WEBM|HLS|DASH}" (original resolution) or
 * "{MP4|WEBM|HLS|DASH} {4K (2160p)|Full HD (1080p)|…}".
 */
function parseStreamLabel(label: string): ParsedStreamLabel {
  const match = label.match(/^(.+?)\s+[^(]+\((\d+p)\)$/);
  if (!match) return { codec: label };
  return { codec: match[1], height: match[2] };
}

/**
 * A label for a stream within its group: the codec for resolution streams ("HLS"),
 * otherwise the full label ("Direct stream", "MKV", "MP4" for original resolution).
 */
export function getStreamItemLabel(source: SceneStreamSource): string {
  return parseStreamLabel(source.label ?? "").codec;
}

/**
 * Display order for stream codecs within a group: the direct stream first, then
 * file containers, then adaptive streaming formats. Matches the server's own order
 * for an untouched source list.
 */
const CODEC_DISPLAY_ORDER = ["Direct stream", "MKV", "MP4", "WEBM", "HLS", "DASH"];

function codecDisplayRank(label: string): number {
  const { codec } = parseStreamLabel(label);
  const index = CODEC_DISPLAY_ORDER.indexOf(codec);
  // Unknown codecs sort after the known ones, keeping their relative order
  return index === -1 ? CODEC_DISPLAY_ORDER.length : index;
}

/**
 * Groups streams for display: an "Original" group first (the direct stream, MKV and
 * source-resolution transcodes — all the scene's original resolution), then one group
 * per transcode resolution, highest first. Streams within a group are sorted by
 * canonical codec order so the display is stable regardless of the underlying source
 * list order — the preferred stream is applied by moving it to the front of the source
 * list, which would otherwise leak into the display order.
 */
export function groupSceneStreamsByResolution(sources: SceneStreamSource[]): SceneStreamGroup[] {
  const originalGroup: SceneStreamGroup = { id: "original", label: "Original", sources: [] };
  const groups: SceneStreamGroup[] = [originalGroup];
  const groupById = new Map<string, SceneStreamGroup>();
  const getResolutionGroup = (height: string) => {
    let group = groupById.get(height);
    if (!group) {
      group = { id: height, label: height, sources: [] };
      groupById.set(height, group);
      groups.push(group);
    }
    return group;
  };

  for (const source of sources) {
    const { height } = parseStreamLabel(source.label ?? "");
    if (height) {
      getResolutionGroup(height).sources.push(source);
    } else {
      originalGroup.sources.push(source);
    }
  }

  // The server groups streams by codec rather than resolution, so encounter order of
  // the resolution groups isn't guaranteed — sort them explicitly, highest first
  groups.sort((a, b) => {
    if (a === originalGroup) return -1;
    if (b === originalGroup) return 1;
    return resolutionHeight(b.id) - resolutionHeight(a.id);
  });

  for (const group of groups) {
    group.sources.sort(
      (a, b) => codecDisplayRank(a.label ?? "") - codecDisplayRank(b.label ?? "")
    );
  }

  return groups.filter(group => group.sources.length > 0);
}

function resolutionHeight(groupId: string): number {
  return parseInt(groupId, 10) || 0;
}

/**
 * Returns the sources with the stream matching `label` moved to the front. The
 * source selector plugin loads `sources[0]` as the default, so this is how a
 * preferred stream is applied to a scene. Returns the input array unchanged when
 * the label isn't found (e.g. the scene has no stream at that resolution) or is
 * already first.
 */
export function moveStreamToFront<T extends SceneStreamSource>(sources: T[], label: string): T[] {
  const index = sources.findIndex(source => source.label === label);
  if (index <= 0) return sources;
  return [sources[index], ...sources.slice(0, index), ...sources.slice(index + 1)];
}
