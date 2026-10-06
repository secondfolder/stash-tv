import { ApolloClient, ApolloLink, InMemoryCache } from "@apollo/client";
import { getClient } from "stash-ui/dist/src/core/StashService";
import { createStashSchemaCompatLink, loadStashSchema } from "../helpers/stash-schema-compat";

const clientsWithCompatLink = new WeakSet<ApolloClient<unknown>>();

/**
 * Adapt every operation sent through Stash's own client (which Stash's query helpers use directly) to the connected
 * Stash's version. The client below shares its link, so gets the same.
 *
 * @see docs/stash-compatibility.md
 */
function addCompatLink(client: ApolloClient<unknown>) {
    if (clientsWithCompatLink.has(client)) return;
    clientsWithCompatLink.add(client);
    const stashLink = client.link;
    client.setLink(ApolloLink.from([createStashSchemaCompatLink(() => loadStashSchema(stashLink)), stashLink]));
}

export function getApolloClient() {
    const originalClient = getClient()
    addCompatLink(originalClient)
    // The "config" property on the cache is not officially documented or typed but it exists in practice.
    const originalCacheConfig = 'config' in originalClient.cache ? originalClient.cache.config as NonNullable<ConstructorParameters<typeof InMemoryCache>[0]> : {}
    const newCache = new InMemoryCache({
        ...originalCacheConfig,
    });
    const newClient = new ApolloClient({
        link: originalClient.link,
        cache: newCache,
    });
    return newClient;
}
