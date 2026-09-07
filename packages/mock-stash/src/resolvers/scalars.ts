import { GraphQLScalarType, valueFromASTUntyped } from "graphql";

/**
 * Stash's custom scalars. Stash (gqlgen) exposes these as loose JSON-ish values; the mock
 * passes them through unchanged, which is exactly what the app relies on.
 */

function identity(name: string, description: string) {
  return new GraphQLScalarType({
    name,
    description,
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: (ast) => valueFromASTUntyped(ast),
  });
}

export const scalarResolvers = {
  Time: identity("Time", "RFC3339 timestamp (pass-through)"),
  Timestamp: identity("Timestamp", "RFC3339-ish timestamp (pass-through)"),
  Map: identity("Map", "String -> Any map (pass-through)"),
  BoolMap: identity("BoolMap", "String -> Boolean map (pass-through)"),
  PluginConfigMap: identity("PluginConfigMap", "Plugin ID -> config map (pass-through)"),
  Any: identity("Any", "Any value (pass-through)"),
  Int64: identity("Int64", "64-bit integer (pass-through)"),
  Upload: identity("Upload", "Multipart file upload (unused by mock)"),
};
