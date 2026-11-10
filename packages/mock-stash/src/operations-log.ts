import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { Kind, type DocumentNode, type OperationDefinitionNode } from "graphql";

/**
 * A log of every GraphQL operation mock-stash executes, for checking each has a conformance case (see
 * docs/testing-mock-stash.md § "Coverage"). Written when `MOCK_STASH_OPERATIONS_LOG` names a file: one JSON line per
 * operation, the first time a process executes it. Test runs append to the same file from several processes.
 */

export interface LoggedOperation {
  /** The operation's name, or the root fields it selects for one without a name */
  name: string;
  /** Whether it has a name of its own (the app's operations do) */
  named: boolean;
  /** "query", "mutation" or "subscription" */
  type: string;
  /** The root fields it selects, e.g. `findScenes` */
  rootFields: string[];
}

const logged = new Set<string>();

export function describeOperation(document: DocumentNode, operationName?: string | null): LoggedOperation | undefined {
  const operations = document.definitions.filter(
    (definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION,
  );
  const operation = operationName ? operations.find((op) => op.name?.value === operationName) : operations[0];
  if (!operation) return undefined;
  const rootFields = operation.selectionSet.selections
    .filter((selection) => selection.kind === Kind.FIELD && !selection.name.value.startsWith("__"))
    .map((selection) => (selection.kind === Kind.FIELD ? selection.name.value : ""));
  return { name: operation.name?.value ?? rootFields.join(","), named: !!operation.name, type: operation.operation, rootFields };
}

export function logOperation(document: DocumentNode, operationName?: string | null) {
  const file = process.env.MOCK_STASH_OPERATIONS_LOG;
  if (!file) return;
  const operation = describeOperation(document, operationName);
  if (!operation || logged.has(operation.name)) return;
  logged.add(operation.name);
  appendFileSync(file, `${JSON.stringify(operation)}\n`);
}

/** Every operation logged to the file, once each */
export function readOperationsLog(file: string): LoggedOperation[] {
  if (!existsSync(file)) return [];
  const operations = new Map<string, LoggedOperation>();
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    const operation = JSON.parse(line) as LoggedOperation;
    operations.set(operation.name, operation);
  }
  return [...operations.values()];
}
