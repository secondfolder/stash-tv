import { gql, type TypedDocumentNode } from "@apollo/client";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";

/**
 * The queries finding performers, tags and studios matching what's typed into the search palette, with what its
 * suggestions show of each. Written here rather than in stash-ui's `stash-tv.graphql`, as only the search needs them.
 *
 * @see docs/search.md § "Suggestions"
 */

type SearchVariables = { filter: GQL.FindFilterType };

export type SearchPerformer = Pick<
  GQL.Performer,
  "id" | "name" | "disambiguation" | "alias_list" | "image_path" | "favorite" | "country" | "birthdate" | "death_date" | "scene_count"
>;

export const SearchPerformersForTvDocument: TypedDocumentNode<
  { findPerformers: { performers: SearchPerformer[] } },
  SearchVariables
> = gql`
  query SearchPerformersForTv($filter: FindFilterType) {
    findPerformers(filter: $filter) {
      performers {
        id
        name
        disambiguation
        alias_list
        image_path
        favorite
        country
        birthdate
        death_date
        scene_count
      }
    }
  }
`;

export type SearchTag = Pick<GQL.Tag, "id" | "name" | "aliases" | "image_path" | "favorite" | "scene_count" | "scene_marker_count"> & {
  parents: Pick<GQL.Tag, "id" | "name">[];
};

export const SearchTagsForTvDocument: TypedDocumentNode<{ findTags: { tags: SearchTag[] } }, SearchVariables> = gql`
  query SearchTagsForTv($filter: FindFilterType) {
    findTags(filter: $filter) {
      tags {
        id
        name
        aliases
        image_path
        favorite
        scene_count
        scene_marker_count
        parents {
          id
          name
        }
      }
    }
  }
`;

export type SearchStudio = Pick<GQL.Studio, "id" | "name" | "aliases" | "image_path" | "favorite" | "scene_count"> & {
  parent_studio?: Pick<GQL.Studio, "id" | "name"> | null;
};

export const SearchStudiosForTvDocument: TypedDocumentNode<{ findStudios: { studios: SearchStudio[] } }, SearchVariables> = gql`
  query SearchStudiosForTv($filter: FindFilterType) {
    findStudios(filter: $filter) {
      studios {
        id
        name
        aliases
        image_path
        favorite
        scene_count
        parent_studio {
          id
          name
        }
      }
    }
  }
`;

/**
 * How many of each kind of entity are fetched for what's typed, sorted by name, before being ranked by how well they
 * match (as Stash's own selects do, which fetch more). Enough to find a close match among names that merely contain it
 */
export const SEARCH_FETCH_COUNT = 25;

/** The variables finding the entities whose names (or aliases) match the text */
export function searchVariables(query: string): SearchVariables {
  return { filter: { q: query, per_page: SEARCH_FETCH_COUNT, sort: "name", direction: GQL.SortDirectionEnum.Asc } };
}
