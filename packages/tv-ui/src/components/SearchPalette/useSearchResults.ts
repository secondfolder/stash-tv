import { useEffect, useState } from "react";
import { useQuery } from "@apollo/client";
import { sortByRelevance } from "stash-ui/dist/src/utils/query";
import {
  searchVariables,
  SearchPerformersForTvDocument,
  SearchStudiosForTvDocument,
  SearchTagsForTvDocument,
} from "./search-queries";

/** How long typing has to pause before the text is searched for, so each key typed doesn't send its own queries */
export const SEARCH_DEBOUNCE_MS = 250;

/** How many of each kind of entity are suggested, the best matches */
export const SUGGESTIONS_PER_KIND = 5;

/**
 * The performers, tags and studios matching the text, the best matches first (as Stash's own selects rank them, by
 * name, then alias), searched for once typing pauses. Each kind arrives as soon as its query answers, the results for
 * what was typed before staying until then, so the list doesn't empty and refill as the user types.
 *
 * @see docs/search.md § "Suggestions"
 */
export function useSearchResults(query: string) {
  const text = query.trim();
  const [searched, setSearched] = useState(text);
  useEffect(() => {
    const timeout = setTimeout(() => setSearched(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [text]);

  const options = { variables: searchVariables(searched), skip: !searched };
  const performers = useQuery(SearchPerformersForTvDocument, options);
  const tags = useQuery(SearchTagsForTvDocument, options);
  const studios = useQuery(SearchStudiosForTvDocument, options);

  const best = <T extends { id: string; name: string }>(found: T[] | undefined, aliases: (entity: T) => string[]) =>
    found ? sortByRelevance(searched, found, (entity) => entity.name, aliases).slice(0, SUGGESTIONS_PER_KIND) : [];

  return {
    /** The text the results are for: what was typed, once typing paused */
    searched,
    /** Whether results for what's typed are still to come */
    loading: !!text && (searched !== text || performers.loading || tags.loading || studios.loading),
    performers: best((performers.data ?? performers.previousData)?.findPerformers.performers, (performer) => performer.alias_list),
    tags: best((tags.data ?? tags.previousData)?.findTags.tags, (tag) => tag.aliases),
    studios: best((studios.data ?? studios.previousData)?.findStudios.studios, (studio) => studio.aliases),
    errors: [performers.error, tags.error, studios.error].filter((error) => error !== undefined),
  };
}
