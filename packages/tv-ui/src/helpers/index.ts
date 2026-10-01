import { GenderEnum, Maybe } from "stash-ui/dist/src/core/generated-graphql";

/** Sort performers by gender then alphabetically. */
export function sortPerformers<T extends IPerformerFragment>(performers: T[]) {
  const ret = performers.slice();
  ret.sort((a, b) => {
    if (a.gender === b.gender) {
      // sort by name
      return (a.name ?? "").localeCompare(b.name ?? "");
    }

    // TODO - may want to customise gender order
    const aIndex = a.gender ? GENDERS.indexOf(a.gender) : GENDERS.length;
    const bIndex = b.gender ? GENDERS.indexOf(b.gender) : GENDERS.length;
    return aIndex - bIndex;
  });

  return ret;
}

interface IPerformerFragment {
  name?: Maybe<string>;
  gender?: Maybe<GenderEnum>;
}

/** `enum GenderEnum` as an array. */
export const GENDERS = [
  "FEMALE",
  "TRANSGENDER_FEMALE",
  "MALE",
  "TRANSGENDER_MALE",
  "INTERSEX",
  "NON_BINARY",
] as GenderEnum[];

export function clamp(min: number, num: number, max: number) {
  return Math.min(Math.max(num, min), max);
}

export function updateReadOnlyProp(obj: any, prop: string, value: any) {
  Object.defineProperty(obj, prop, { value, writable: true, enumerable: isEnumerableIncludingInherited(obj, prop) });
}

export function updateReadOnlyProps(obj: any, props: Record<string, any>) {
  for (const [prop, value] of Object.entries(props)) {
    updateReadOnlyProp(obj, prop, value);
  }
}

function isEnumerableIncludingInherited(obj: any, prop: string) {
  let current = obj;
  while (current) {
    const desc = Object.getOwnPropertyDescriptor(current, prop);
    if (desc) return !!desc.enumerable;
    current = Object.getPrototypeOf(current);
  }
  return false; // not found anywhere in the chain
}

export function getSceneIdForVideoJsPlayer(videoElm: Element): string {
  let node: Element | null = videoElm;
  while (node !== null) {
    if (node instanceof HTMLElement && 'sceneId' in node.dataset && node.dataset.sceneId) {
      return node.dataset.sceneId;
    }
    node = node.parentElement;
  }
  throw new Error("Could not find sceneId for Video.js player");
}

export function getMediaItemIdForVideoJsPlayer(videoElm: Element): string {
  let node: Element | null = videoElm;
  while (node !== null) {
    if (node instanceof HTMLElement && 'sceneId' in node.dataset && node.dataset.sceneId) {
      return node.id.replace(/^scene-player-/, '');
    }
    node = node.parentElement;
  }
  throw new Error("Could not find mediaItemId for Video.js player");
}

export function roundTo(num: number, decimals = 0) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

export function roundToNearest(num: number, nearest = 1) {
  return Math.round(num / nearest) * nearest;
}

/** Returns the option after the one whose value is `current`, wrapping around to
 * the first. An unknown `current` also yields the first option. */
export function getNextOption<Option extends { value: unknown }>(options: readonly Option[], current: Option["value"]): Option | undefined {
  const currentIndex = options.findIndex(option => option.value === current);
  return options[(currentIndex + 1) % options.length];
}

/** Formats a length of time in seconds for display, e.g. 90 -> "1 minute 30 seconds". */
export function formatDuration(totalSeconds: number) {
  const units = [
    { name: "hour", seconds: 60 * 60 },
    { name: "minute", seconds: 60 },
    { name: "second", seconds: 1 },
  ];
  let remaining = Math.round(totalSeconds);
  const parts = [];
  for (const unit of units) {
    const count = Math.floor(remaining / unit.seconds);
    remaining -= count * unit.seconds;
    if (count > 0) parts.push(`${count} ${unit.name}${count === 1 ? "" : "s"}`);
  }
  return parts.length ? parts.join(" ") : "0 seconds";
}
