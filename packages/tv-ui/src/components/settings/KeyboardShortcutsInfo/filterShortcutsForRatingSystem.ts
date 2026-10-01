import { RatingSystemType } from "stash-ui/dist/src/utils/rating";

const ratingSystemTag = /\s*<!--\s*rating-system:\s*(\w+)\s*-->\s*$/;

/**
 * Removes help-text lines tagged (with a trailing `<!-- rating-system: <type> -->`) for a rating system other than
 * the given one, and strips the tags from the lines that remain.
 *
 * @see docs/keyboard-shortcuts.md § "Help text"
 */
export function filterShortcutsForRatingSystem(markdown: string, ratingSystem: RatingSystemType) {
  return markdown
    .split("\n")
    .flatMap((line) => {
      const match = line.match(ratingSystemTag);
      if (!match) return [line];
      return match[1] === ratingSystem ? [line.replace(ratingSystemTag, "")] : [];
    })
    .join("\n");
}
