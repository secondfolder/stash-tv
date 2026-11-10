import type { DocumentNode } from "graphql";
import type { EntityType } from "../../src/id-map";

/**
 * A conformance case: an operation sent to both mock-stash and a real Stash, whose responses must match. The cases are
 * data (`cases.ts`), so a fast test can check every operation the mock implements has one without running them.
 *
 * @see docs/testing-mock-stash.md § "Conformance"
 */

/** Gives a mock id's (or a created entity's alias's) counterpart on the server a case is being sent to */
export type Ids = (type: EntityType, mockId: string) => string;

/** An operation sent to each server on its own, e.g. to put back what a case changed */
export interface Step {
  document: DocumentNode;
  variables?: (id: Ids) => Record<string, unknown>;
}

interface BaseCase {
  name: string;
  /** Cases run in order; a group's cases leave things as they found them */
  group: string;
  document: DocumentNode;
  /** Just the part of the (normalised) response to compare, for responses that can't match in full: say why */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project?: (data: any) => unknown;
  /** Sent to each server afterwards */
  after?: Step[];
}

export interface OperationCase extends BaseCase {
  kind?: "operation";
  variables?: (id: Ids) => Record<string, unknown>;
  /** Both servers should reject it */
  expectError?: boolean;
  /**
   * The entities the operation creates, each with an alias later cases refer to it by (in place of a mock id, as each
   * server chooses its own)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creates?: (data: any) => { type: EntityType, alias: string, id: string }[];
}

export interface SubscriptionCase extends BaseCase {
  kind: "subscription";
  /** Sent to each server while subscribed, for events to arrive */
  trigger: Step[];
  /** How long to collect events after the trigger */
  waitMs?: number;
}

export type ConformanceCase = OperationCase | SubscriptionCase;
