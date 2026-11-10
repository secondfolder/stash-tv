import { describe, expect, it } from "vitest";
import { Kind, type DocumentNode, type OperationDefinitionNode } from "graphql";
import { queryResolvers } from "../src/resolvers/query";
import { mutationResolvers } from "../src/resolvers/mutation";
import { subscriptionResolvers } from "../src/resolvers/subscription";
import { CASES } from "./conformance/cases";
import { WAIVERS } from "./conformance/waivers";
import { operationsWithoutCases } from "./conformance/operations-coverage";

/**
 * Every operation mock-stash implements has a conformance case, comparing it with a real Stash. Checked here without
 * Docker, from the cases' documents, so coverage can't slip unnoticed: a new resolver needs a case (or a waiver saying
 * why not).
 *
 * @see docs/testing-mock-stash.md § "Coverage"
 */

/** The root fields an operation document selects */
export function rootFields(document: DocumentNode): string[] {
  return document.definitions
    .filter((definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION)
    .flatMap((operation) => operation.selectionSet.selections)
    .flatMap((selection) => (selection.kind === Kind.FIELD && !selection.name.value.startsWith("__") ? [selection.name.value] : []));
}

const implemented = [
  ...Object.keys(queryResolvers.Query),
  ...Object.keys(mutationResolvers.Mutation),
  ...Object.keys(subscriptionResolvers.Subscription),
].sort();
const covered = new Set(CASES.flatMap((testCase) => rootFields(testCase.document)));

describe("conformance coverage", () => {
  it("finds the mock's resolvers", () => {
    expect(implemented.length).toBeGreaterThan(40);
  });

  it("has a case for every query, mutation and subscription the mock implements, or a waiver saying why not", () => {
    expect(implemented.filter((field) => !covered.has(field) && !(field in WAIVERS))).toEqual([]);
  });

  it("has no waiver for an operation that's covered, or that the mock doesn't implement", () => {
    expect(Object.keys(WAIVERS).filter((field) => covered.has(field) || !implemented.includes(field))).toEqual([]);
  });

  it("has no case for an operation the mock doesn't implement", () => {
    expect([...covered].filter((field) => !implemented.includes(field))).toEqual([]);
  });
});

describe("the check of the operations a test run sent", () => {
  it("accepts the app's operations that have a case", () => {
    expect(operationsWithoutCases([
      { name: "FindFullScenesForTv", named: true, type: "query", rootFields: ["findScenes"] },
      { name: "SceneAddPlay", named: true, type: "mutation", rootFields: ["sceneAddPlay"] },
    ])).toEqual([]);
  });

  it("rejects an operation of the app's with no case of its own, though another case covers its root field", () => {
    expect(operationsWithoutCases([{ name: "FindScenesSomeNewWay", named: true, type: "query", rootFields: ["findScenes"] }]))
      .toEqual(["query FindScenesSomeNewWay (findScenes)"]);
  });

  it("accepts an unnamed operation whose root fields are covered, and one asking only about the schema", () => {
    expect(operationsWithoutCases([
      { name: "tagCreate,tagCreate", named: false, type: "mutation", rootFields: ["tagCreate", "tagCreate"] },
      { name: "IntrospectionQuery", named: true, type: "query", rootFields: [] },
    ])).toEqual([]);
  });

  it("rejects an unnamed operation with a root field no case covers", () => {
    expect(operationsWithoutCases([{ name: "performerCreate", named: false, type: "mutation", rootFields: ["performerCreate"] }]))
      .toEqual(["mutation performerCreate (performerCreate)"]);
  });
});
