import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeExecutableSchema } from "@graphql-tools/schema";
import type { GraphQLSchema } from "graphql";
import { resolvers } from "./resolvers";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The mock server deliberately serves Stash's *own* GraphQL schema (the one from the
 * `stash` git submodule pinned in stash-ui) rather than a hand-written subset, so that it
 * stays structurally faithful to the real API. `test/conformance` compares responses
 * against a real Stash instance to keep the resolver *behaviour* faithful too.
 */
const SCHEMA_DIR = path.resolve(here, "../../stash-ui/stash/graphql/schema");

function readGraphqlFiles(dir: string): string {
  let contents = "";
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      contents += readGraphqlFiles(fullPath);
    } else if (entry.endsWith(".graphql")) {
      contents += `\n${readFileSync(fullPath, "utf-8")}`;
    }
  }
  return contents;
}

let typeDefs: string | undefined;
export function loadStashTypeDefinitions(): string {
  return (typeDefs ??= readGraphqlFiles(SCHEMA_DIR));
}

let schema: GraphQLSchema | undefined;
/** The schema is context-driven (resolvers read everything from the per-server context),
 * so a single schema instance can safely be shared by every server. */
export function getStashSchema(): GraphQLSchema {
  return (schema ??= makeExecutableSchema({
    typeDefs: loadStashTypeDefinitions(),
    resolvers,
  }));
}
