/**
 * Stash TV is built against Stash's develop branch and supports the latest Stash releases too, by adapting each query
 * to the connected server's schema.
 *
 * @see docs/stash-compatibility.md § "Adapting queries to the server"
 */

import { describe, expect, it } from "vitest";
import { buildSchema, Kind, parse, print, validate, type DocumentNode } from "graphql";
import { loadStashTypeDefinitions, STASH_VERSIONS } from "mock-stash";
import * as GQL from "stash-ui/dist/src/core/generated-graphql";
import {
  adaptDocumentToSchema,
  adaptVariablesToSchema,
  fillMissingFields,
} from "../../../src/helpers/stash-schema-compat";

const developSchema = buildSchema(loadStashTypeDefinitions("develop"), { assumeValidSDL: true });
const releases = STASH_VERSIONS.filter((version) => version !== "develop");

/** Every query, mutation and subscription Stash's UI (and so Stash TV) can send */
const stashOperations = Object.entries(GQL)
  .filter((entry): entry is [string, DocumentNode] => {
    const value = entry[1] as Partial<DocumentNode> | undefined;
    // Leaving out the fragments generated-graphql also exports on their own
    return value?.kind === Kind.DOCUMENT
      && !!value.definitions?.some((definition) => definition.kind === Kind.OPERATION_DEFINITION);
  });

describe("Stash's operations", () => {
  it("are all found", () => {
    expect(stashOperations.length).toBeGreaterThan(100);
  });

  // Even when develop's other tests are left out (its commit is a release's), the app's queries come from it
  it("are left as they are against the Stash version Stash TV is built against", () => {
    const changed = stashOperations
      .filter(([, document]) => adaptDocumentToSchema(document, developSchema) !== document)
      .map(([name]) => name);
    expect(changed).toEqual([]);
  });

  describe.each(releases)("against the %s", (release) => {
    const releaseSchema = buildSchema(loadStashTypeDefinitions(release), { assumeValidSDL: true });

    it("are valid once adapted to it", () => {
      const invalid = stashOperations
        // An operation using a query or mutation the release doesn't have can't be adapted; nothing Stash TV shows
        // sends one
        .filter(([, document]) => validate(releaseSchema, document).every((error) => !/on type "(Query|Mutation|Subscription)"|Unknown type/.test(error.message)))
        .map(([name, document]) => [name, validate(releaseSchema, adaptDocumentToSchema(document, releaseSchema)).map((error) => error.message)] as const)
        .filter(([, errors]) => errors.length > 0);
      expect(invalid).toEqual([]);
    });

    it("include the ones Stash TV sends on startup, which it can run once adapted", () => {
      // These needn't need adapting: once a release includes everything develop has, nothing does
      for (const document of [GQL.ConfigurationDocument, GQL.FindFullScenesForTvDocument, GQL.FindSceneMarkersForTvDocument]) {
        expect(validate(releaseSchema, adaptDocumentToSchema(document, releaseSchema))).toEqual([]);
      }
    });
  });
});

const oldSchema = buildSchema(`
  type Query { scene(id: ID!): Scene, scenes(filter: Filter): [Scene!]! }
  type Scene { id: ID!, title: String, studio: Studio }
  type Studio { id: ID!, name: String! }
  input Filter { q: String }
`);

describe("adaptDocumentToSchema", () => {
  it("leaves out fields and arguments the schema lacks", () => {
    const document = parse(`query($id: ID!) { scene(id: $id, extra: 1) { id title newField } }`);
    expect(print(adaptDocumentToSchema(document, oldSchema))).toBe(print(parse(`query($id: ID!) { scene(id: $id) { id title } }`)));
  });

  it("leaves out a field whose every subfield is left out, and a fragment and variable left unused", () => {
    const document = parse(`
      query($id: ID!, $depth: Int) { scene(id: $id) { id studio { newCount(depth: $depth) } ...NewData } }
      fragment NewData on Scene { newField }
    `);
    expect(print(adaptDocumentToSchema(document, oldSchema))).toBe(print(parse(`query($id: ID!) { scene(id: $id) { id } }`)));
  });

  it("leaves out fragments on types the schema lacks", () => {
    const document = parse(`
      { scenes { id ...on NewType { x } ...NewTypeData } }
      fragment NewTypeData on NewType { y }
    `);
    expect(print(adaptDocumentToSchema(document, oldSchema))).toBe(print(parse(`{ scenes { id } }`)));
  });

  it("gives back the same document when the schema has everything it asks for", () => {
    const document = parse(`{ scenes { id studio { name } } }`);
    expect(adaptDocumentToSchema(document, oldSchema)).toBe(document);
  });
});

describe("adaptVariablesToSchema", () => {
  it("leaves out variables no longer declared and input fields the schema lacks", () => {
    const adapted = adaptDocumentToSchema(parse(`query($filter: Filter, $depth: Int) { scenes(filter: $filter) { id newCount(depth: $depth) } }`), oldSchema);
    expect(adaptVariablesToSchema({ filter: { q: "a", newCriterion: 1 }, depth: 2 }, adapted, oldSchema)).toEqual({ filter: { q: "a" } });
  });
});

describe("fillMissingFields", () => {
  it("gives the fields left out of the query null values, in fragments and lists too", () => {
    const document = parse(`
      { scenes { __typename id newField studio { __typename name newCount } ...NewData } }
      fragment NewData on Scene { otherNewField }
    `);
    const data = { scenes: [{ __typename: "Scene", id: "1", studio: { __typename: "Studio", name: "S" } }, { __typename: "Scene", id: "2", studio: null }] };
    expect(fillMissingFields(data, document, oldSchema)).toEqual({
      scenes: [
        { __typename: "Scene", id: "1", newField: null, otherNewField: null, studio: { __typename: "Studio", name: "S", newCount: null } },
        { __typename: "Scene", id: "2", newField: null, otherNewField: null, studio: null },
      ],
    });
  });

  it("doesn't fill in a fragment's fields on an object of another type", () => {
    const document = parse(`{ scenes { __typename id ...on Studio { name } } }`);
    expect(fillMissingFields({ scenes: [{ __typename: "Scene", id: "1" }] }, document, oldSchema)).toEqual({ scenes: [{ __typename: "Scene", id: "1" }] });
  });
});
