import { expect } from "vitest";
import { Kind, print, visit, type DocumentNode, type FieldNode, type SelectionSetNode } from "graphql";
import { createClient } from "graphql-ws";
import WebSocket from "ws";
import type { StashVersion } from "../../src/stash-versions";
import { getStashSchema } from "../../src/schema";
// The app's own adapting of its operations to the server's schema, so a case sends a version what the app would
// (leaving out what an older release lacks). From tv-ui's source, as the app's behaviour is what's being reproduced.
import { adaptDocumentToSchema, adaptVariablesToSchema } from "../../../tv-ui/src/helpers/stash-schema-compat";
import { ENTITY_TYPES, translateFilterIds, type EntityType, type IdMap } from "../../src/id-map";
import type { ConformanceCase, Ids } from "./case";

/**
 * Runs conformance cases against mock-stash and a seeded real Stash side by side, in order, comparing their responses.
 * Each case's variables name entities by their mock ids, which the session translates for the real Stash, and the
 * real Stash's ids in its responses are translated back, so responses match ids and all.
 *
 * @see docs/testing-mock-stash.md § "Conformance"
 */

export interface Server {
  side: "mock" | "real";
  httpUrl: string;
  wsUrl: string;
  baseUrl: string;
}

interface GraphqlResult {
  data?: Record<string, unknown> | null;
  errors?: { message: string }[];
}

const TYPENAME: FieldNode = { kind: Kind.FIELD, name: { kind: Kind.NAME, value: "__typename" } };

/** The document with `__typename` in every selection set, so the session can tell which ids are which entity's */
export function withTypenames(document: DocumentNode): DocumentNode {
  return visit(document, {
    SelectionSet: {
      leave(node: SelectionSetNode, _key, parent) {
        if (parent && "kind" in parent && parent.kind === Kind.OPERATION_DEFINITION) return node;
        const hasTypename = node.selections.some((selection) => selection.kind === Kind.FIELD && selection.name.value === "__typename");
        return hasTypename ? node : { ...node, selections: [...node.selections, TYPENAME] };
      },
    },
  });
}

/** Timestamps the servers set themselves, which can't match */
const VOLATILE_FIELDS = new Set(["created_at", "updated_at", "mod_time"]);
/** URL paths naming an entity by id, by the entity type */
const URL_ENTITY_PATHS: Record<string, EntityType> = {
  scene: "Scene",
  tag: "Tag",
  performer: "Performer",
  studio: "Studio",
  scene_marker: "SceneMarker",
};

export class Session {
  constructor(
    readonly version: StashVersion,
    readonly mock: Server,
    readonly real: Server,
    readonly ids: IdMap,
  ) {}

  /** Entities cases created, by alias: each server's id for them */
  private aliases = new Map<string, Record<Server["side"], string>>();

  /** Translates a mock id (or a created entity's alias) for a server: the real Stash's own id for the real one */
  idsFor(server: Server): Ids {
    return (type, mockId) => {
      const created = this.aliases.get(`${type}:${mockId}`);
      if (created) return created[server.side];
      return server.side === "mock" ? mockId : this.ids.real(type, mockId);
    };
  }

  /** The operation as the app sends it to this Stash version: without what the version's schema lacks */
  private adapt(document: DocumentNode, variables: Record<string, unknown> = {}) {
    const schema = getStashSchema(this.version);
    const adapted = adaptDocumentToSchema(document, schema);
    return { document: adapted, variables: adaptVariablesToSchema(variables, adapted, schema) };
  }

  async send(server: Server, original: DocumentNode, originalVariables: Record<string, unknown> = {}): Promise<GraphqlResult> {
    const { document, variables } = this.adapt(original, originalVariables);
    const response = await fetch(server.httpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: print(withTypenames(document)), variables }),
    });
    return (await response.json()) as GraphqlResult;
  }

  /** Subscribes on a server, then sends `trigger` there, resolving with the events received within `waitMs` */
  async subscribeDuring(
    server: Server,
    document: DocumentNode,
    trigger: () => Promise<unknown>,
    waitMs: number,
  ): Promise<GraphqlResult[]> {
    const client = createClient({ url: server.wsUrl, webSocketImpl: WebSocket, retryAttempts: 0 });
    const events: GraphqlResult[] = [];
    const subscribed = new Promise<void>((resolve) => setTimeout(resolve, 500));
    const unsubscribe = client.subscribe(
      { query: print(withTypenames(this.adapt(document).document)) },
      { next: (event) => { events.push(event as GraphqlResult); }, error: (error) => events.push({ errors: [{ message: String(error) }] }), complete: () => {} },
    );
    await subscribed;
    await trigger();
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    unsubscribe();
    await client.dispose();
    return events;
  }

  /** The response as both servers should give it: real ids as the mock's, URLs on one host, without timestamps */
  normalise(server: Server, value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.normalise(server, item));
    if (typeof value === "string") return this.normaliseString(server, value);
    if (value === null || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const type = record.__typename as EntityType | undefined;
    const normalised: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(record)) {
      if (VOLATILE_FIELDS.has(key)) continue;
      if (key === "id" && type && ENTITY_TYPES.includes(type) && typeof field === "string") {
        normalised[key] = this.mockId(server, type, field);
      } else if (key === "object_filter" && type === "SavedFilter" && field && typeof field === "object") {
        // A saved filter's criteria name entities by id in its JSON
        normalised[key] = translateFilterIds(field as Record<string, unknown>, (entityType, id) => this.mockId(server, entityType, id));
      } else {
        normalised[key] = this.normalise(server, field);
      }
    }
    return normalised;
  }

  private mockId(server: Server, type: EntityType, id: string): string {
    if (server.side === "mock") return id;
    return this.ids.mock(type, id) ?? `<real ${type} ${id} unknown to the mock>`;
  }

  private normaliseString(server: Server, value: string): string {
    if (!value.startsWith(server.baseUrl)) return value;
    const url = new URL(value);
    // A cache-busting timestamp, e.g. on an image
    url.searchParams.delete("t");
    // Only a whole path segment: a sprite's or thumbnails' name starts with the file's hash, not an id
    const path = url.pathname.replace(/\/(scene_marker|scene|tag|performer|studio)\/([^/_?]+)(?=\/|$)/g, (match, kind: string, id: string) => {
      const type = URL_ENTITY_PATHS[kind];
      return type ? `/${kind}/${this.mockId(server, type, id)}` : match;
    });
    const query = url.searchParams.toString();
    return `<stash>${path}${query ? `?${query}` : ""}`;
  }

  /** Runs a case on both servers and compares what they give back */
  async run(testCase: ConformanceCase) {
    if (testCase.kind === "subscription") {
      const [mockEvents, realEvents] = await Promise.all([this.mock, this.real].map((server) =>
        this.subscribeDuring(server, testCase.document, () => this.runSteps(server, testCase.trigger), testCase.waitMs ?? 2_000)));
      const project = testCase.project ?? ((events: unknown) => events);
      expect(project(this.normalise(this.mock, mockEvents)), testCase.name).toEqual(project(this.normalise(this.real, realEvents)));
      return;
    }

    const [mockResult, realResult] = [
      await this.send(this.mock, testCase.document, testCase.variables?.(this.idsFor(this.mock))),
      await this.send(this.real, testCase.document, testCase.variables?.(this.idsFor(this.real))),
    ];
    if (testCase.expectError) {
      expect(mockResult.errors?.length, `the mock should reject it as Stash does`).toBeGreaterThan(0);
      expect(realResult.errors?.length, `Stash should reject it`).toBeGreaterThan(0);
    } else {
      expect(realResult.errors, "Stash's errors").toBeUndefined();
      expect(mockResult.errors, "the mock's errors").toBeUndefined();
    }
    if (testCase.creates && mockResult.data && realResult.data) {
      const realCreated = testCase.creates(realResult.data);
      for (const created of testCase.creates(mockResult.data)) {
        const real = realCreated.find((entity) => entity.type === created.type && entity.alias === created.alias);
        if (!real) throw new Error(`Stash didn't create the ${created.type} the mock did`);
        this.ids.set(created.type, created.id, real.id);
        this.aliases.set(`${created.type}:${created.alias}`, { mock: created.id, real: real.id });
      }
    }
    const project = testCase.project ?? ((data: unknown) => data);
    expect(
      project(this.normalise(this.mock, mockResult.data ?? null)),
      testCase.name,
    ).toEqual(project(this.normalise(this.real, realResult.data ?? null)));
    await this.runSteps(this.mock, testCase.after);
    await this.runSteps(this.real, testCase.after);
  }

  /** Operations sent to a server alone, e.g. to put back what a case changed */
  private async runSteps(server: Server, steps: ConformanceCase["after"]) {
    for (const step of steps ?? []) {
      const result = await this.send(server, step.document, step.variables?.(this.idsFor(server)));
      if (result.errors?.length) throw new Error(`${server.side}: ${result.errors.map((error) => error.message).join("; ")}`);
    }
  }
}
