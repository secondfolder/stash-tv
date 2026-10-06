import { ApolloLink, Observable, execute, gql, type FetchResult } from "@apollo/client";
import {
  buildClientSchema,
  getIntrospectionQuery,
  isAbstractType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
  Kind,
  typeFromAST,
  TypeInfo,
  visit,
  visitWithTypeInfo,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLInputType,
  type GraphQLSchema,
  type IntrospectionQuery,
  type SelectionSetNode,
} from "graphql";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["stash-tv", "stash-schema-compat"]);

/**
 * Stash TV is built against one Stash version but also supports the latest release, whose schema lacks fields the
 * newer one added. Stash's own queries ask for those fields, and a server rejects a whole query that asks for one it
 * doesn't have. So queries are adapted to the connected server's schema: what it lacks is left out of the query and
 * comes back as null.
 *
 * @see docs/stash-compatibility.md
 */

/**
 * The document without the fields, arguments and fragments `schema` lacks, and without whatever that leaves empty or
 * unused (a field selecting nothing, a fragment no longer spread, a variable no longer used). Returns `document`
 * itself when the schema has everything it asks for.
 */
export function adaptDocumentToSchema(document: DocumentNode, schema: GraphQLSchema): DocumentNode {
  let removed = 0;
  const remove = () => {
    removed++;
    return null;
  };

  const typeInfo = new TypeInfo(schema);
  let adapted = visit(document, visitWithTypeInfo(typeInfo, {
    Field(node) {
      if (node.name.value.startsWith("__")) return;
      // A field under one that's already gone has no parent type
      if (!typeInfo.getParentType() || !typeInfo.getFieldDef()) return remove();
    },
    Argument() {
      if (!typeInfo.getArgument()) return remove();
    },
    InlineFragment(node) {
      if (node.typeCondition && !schema.getType(node.typeCondition.name.value)) return remove();
    },
    FragmentDefinition(node) {
      if (!schema.getType(node.typeCondition.name.value)) return remove();
    },
  }));
  if (removed === 0) return document;

  // Removing one thing can leave another empty or unused, so repeat until nothing more goes
  for (let removedBefore = -1; removedBefore !== removed; ) {
    removedBefore = removed;
    const fragmentNames = new Set(
      adapted.definitions.filter((definition) => definition.kind === Kind.FRAGMENT_DEFINITION)
        .map((definition) => definition.name.value)
    );
    const spreadNames = new Set<string>();
    const usedVariables = new Set<string>();
    adapted = visit(adapted, {
      FragmentSpread(node) {
        if (!fragmentNames.has(node.name.value)) return remove();
        spreadNames.add(node.name.value);
      },
      // A selection with nothing left in it is invalid, so goes too
      Field: { leave: (node) => (node.selectionSet?.selections.length === 0 ? remove() : undefined) },
      InlineFragment: { leave: (node) => (node.selectionSet.selections.length === 0 ? remove() : undefined) },
      FragmentDefinition: { leave: (node) => (node.selectionSet.selections.length === 0 ? remove() : undefined) },
      VariableDefinition: () => false,
      Variable(node) {
        usedVariables.add(node.name.value);
      },
    });
    adapted = visit(adapted, {
      // A fragment that's no longer spread is invalid too
      FragmentDefinition: (node) => (spreadNames.has(node.name.value) ? undefined : remove()),
      VariableDefinition: (node) => (usedVariables.has(node.variable.name.value) ? false : remove()),
    });
  }
  return adapted;
}

/**
 * The variables for `document` (as adapted to `schema`), without those it no longer declares or input object fields
 * `schema` lacks (e.g. a filter criterion added in a newer Stash version).
 */
export function adaptVariablesToSchema(
  variables: Record<string, unknown>,
  document: DocumentNode,
  schema: GraphQLSchema
): Record<string, unknown> {
  const adapted: Record<string, unknown> = {};
  for (const definition of document.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
    for (const variableDefinition of definition.variableDefinitions ?? []) {
      const name = variableDefinition.variable.name.value;
      if (!(name in variables)) continue;
      const type = typeFromAST(schema, variableDefinition.type) as GraphQLInputType | undefined;
      adapted[name] = type ? adaptInputValue(variables[name], type) : variables[name];
    }
  }
  return adapted;
}

function adaptInputValue(value: unknown, type: GraphQLInputType): unknown {
  if (value == null) return value;
  if (isNonNullType(type)) return adaptInputValue(value, type.ofType);
  if (isListType(type)) {
    return Array.isArray(value) ? value.map((item) => adaptInputValue(item, type.ofType)) : adaptInputValue(value, type.ofType);
  }
  if (isInputObjectType(type) && typeof value === "object") {
    const fields = type.getFields();
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key in fields)
        .map(([key, fieldValue]) => [key, adaptInputValue(fieldValue, fields[key].type)])
    );
  }
  return value;
}

/**
 * `data` (the result of `document` as adapted to `schema`) with each field `document` asks for but it lacks set to
 * null, as a server returns a field it has no value for. Apollo's cache treats a result missing a field the query
 * asked for as incomplete, so it would otherwise not hand the result back. Changes `data` in place.
 */
export function fillMissingFields<Data>(data: Data, document: DocumentNode, schema: GraphQLSchema): Data {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
  }

  /** Whether an object of the type named `typename` (when known) matches a fragment's type condition */
  function matches(typename: unknown, typeCondition: string | undefined) {
    if (!typeCondition || typeof typename !== "string" || typename === typeCondition) return true;
    const conditionType = schema.getType(typeCondition);
    const objectType = schema.getType(typename);
    if (!isAbstractType(conditionType) || !isObjectType(objectType)) return false;
    return schema.isSubType(conditionType, objectType);
  }

  function fill(value: unknown, selectionSet: SelectionSetNode) {
    if (Array.isArray(value)) {
      for (const item of value) fill(item, selectionSet);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        const key = selection.alias?.value ?? selection.name.value;
        if (!(key in object)) {
          object[key] = null;
        } else if (selection.selectionSet) {
          fill(object[key], selection.selectionSet);
        }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        if (matches(object.__typename, selection.typeCondition?.name.value)) fill(object, selection.selectionSet);
      } else {
        const fragment = fragments.get(selection.name.value);
        if (fragment && matches(object.__typename, fragment.typeCondition.name.value)) fill(object, fragment.selectionSet);
      }
    }
  }

  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) fill(data, definition.selectionSet);
  }
  return data;
}

/**
 * A link that adapts each operation to the connected Stash's schema (see `adaptDocumentToSchema`), loaded with
 * `loadSchema` before the first operation goes out. If it can't be loaded, operations go out unchanged.
 */
export function createStashSchemaCompatLink(loadSchema: () => Promise<GraphQLSchema>): ApolloLink {
  let schemaLoaded: Promise<GraphQLSchema | undefined> | undefined;
  const adaptedDocuments = new WeakMap<DocumentNode, DocumentNode>();

  return new ApolloLink((operation, forward) => new Observable<FetchResult>((observer) => {
    let subscription: { unsubscribe(): void } | undefined;
    let cancelled = false;

    schemaLoaded ??= loadSchema().catch((error) => {
      logger.warn("Couldn't load Stash's schema, so queries aren't adapted to its version {*}", { error });
      return undefined;
    });
    schemaLoaded.then((schema) => {
      if (cancelled) return;
      const original = operation.query;
      let adapted = schema && adaptedDocuments.get(original);
      if (schema && !adapted) {
        adapted = adaptDocumentToSchema(original, schema);
        adaptedDocuments.set(original, adapted);
      }
      if (!schema || !adapted || adapted === original) {
        subscription = forward(operation).subscribe(observer);
        return;
      }
      operation.query = adapted;
      operation.variables = adaptVariablesToSchema(operation.variables, adapted, schema);
      subscription = forward(operation)
        .map((result) => (result.data ? { ...result, data: fillMissingFields(result.data, original, schema) } : result))
        .subscribe(observer);
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }));
}

const introspectionDocument = gql(getIntrospectionQuery({ descriptions: false, inputValueDeprecation: true }));

/** Load the schema of the Stash server `link` (Stash's own link, so with its URL and credentials) talks to */
export function loadStashSchema(link: ApolloLink): Promise<GraphQLSchema> {
  return new Promise((resolve, reject) => {
    execute(link, { query: introspectionDocument }).subscribe({
      next: (result) => {
        if (!result.data) {
          reject(new Error(`Introspection returned no data: ${JSON.stringify(result.errors)}`));
          return;
        }
        resolve(buildClientSchema(result.data as unknown as IntrospectionQuery));
      },
      error: reject,
    });
  });
}
