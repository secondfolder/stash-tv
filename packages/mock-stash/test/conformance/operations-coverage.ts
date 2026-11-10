import { Kind, type DocumentNode, type OperationDefinitionNode } from "graphql";
import { readOperationsLog, type LoggedOperation } from "../../src/operations-log";
import { CASES } from "./cases";

/**
 * Whether the operations a test run sent mock-stash (its operations log) each have a conformance case. The app's tests
 * check this when they finish, so an operation the app starts sending fails them until it has one.
 *
 * - A named operation (the app's) needs a case using that operation, so it's the app's own document that's compared.
 * - An unnamed one (e.g. a test setting up data) needs each of its root fields covered by some case.
 * - One with no root fields (e.g. the schema's introspection) needs nothing: it doesn't reach mock-stash's resolvers.
 *
 * @see docs/testing-mock-stash.md § "Coverage"
 */

function operations(document: DocumentNode): OperationDefinitionNode[] {
  return document.definitions.filter((definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION);
}

const caseOperationNames = new Set(CASES.flatMap((testCase) => operations(testCase.document).flatMap((op) => op.name ? [op.name.value] : [])));
const caseRootFields = new Set(CASES.flatMap((testCase) => operations(testCase.document)
  .flatMap((op) => op.selectionSet.selections)
  .flatMap((selection) => (selection.kind === Kind.FIELD ? [selection.name.value] : []))));

/** The logged operations without a conformance case, each described for the failure message */
export function operationsWithoutCases(logged: LoggedOperation[]): string[] {
  return logged
    .filter((operation) => operation.rootFields.length > 0)
    .filter((operation) => operation.named
      ? !caseOperationNames.has(operation.name)
      : operation.rootFields.some((field) => !caseRootFields.has(field)))
    .map((operation) => `${operation.type} ${operation.name} (${operation.rootFields.join(", ")})`);
}

/** Throws, listing them, if any operation in the log has no conformance case */
export function checkOperationsLog(file: string) {
  const missing = operationsWithoutCases(readOperationsLog(file));
  if (missing.length > 0) {
    throw new Error(
      `These operations the tests sent mock-stash have no conformance case (packages/mock-stash/test/conformance/cases.ts), `
      + `so nothing checks the mock answers them as Stash does:\n${missing.map((line) => `  - ${line}`).join("\n")}`,
    );
  }
}
