import { RatingSystemType } from "stash-ui/dist/src/utils/rating";

/** A rating as Stash's rating system shows it: out of 5 for stars (e.g. "3.5"), out of 10 for decimal (e.g. "7.2") */
export function formatRating(rating100: number, ratingSystemType: RatingSystemType) {
  if (ratingSystemType === RatingSystemType.Stars) {
    return (rating100 / 20).toFixed(1).replace(/\.0$/, ""); // Convert 0-100 to 0-5
  }
  return (rating100 / 10).toString();
}
