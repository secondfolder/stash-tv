
import { PLUGIN_NAMESPACE } from '../constants';
import { getApolloClient } from '../hooks/getApolloClient';
import * as GQL from "stash-ui/dist/src/core/generated-graphql";

// Lazily created so that importing this module (which happens on any import of the tvConfig
// store) neither constructs an Apollo client nor opens the ScanComplete WebSocket
// subscription — both of which permanently capture the API URL at creation time.
let graphqlClient: ReturnType<typeof getApolloClient> | undefined;
function client() {
    return (graphqlClient ??= getApolloClient());
}

export const stashConfigStorage = {
  getItem: async (key: string) => await getStashTvConfig()
    .then(config => config?.[key] || null)
    .catch(console.error),
  setItem: async (key: string, value: string) => await updateTvConfig(config => ({...config, [key]: value}))
    .catch(console.error),
  removeItem: async (key: string) => await updateTvConfig(
    config => {
      const {[key]: _, ...rest} = config;
      return rest
    }
  ).catch(console.error),
}

async function getStashTvConfig() {
  const result = await client().query({
    query: GQL.ConfigurationDocument,
  });
  return result.data?.configuration.plugins[PLUGIN_NAMESPACE];
}

// Config writes that haven't reached Stash yet
const pendingWrites = new Set<Promise<unknown>>();

/** Resolves once every config write started so far has reached Stash (or failed) */
export async function stashConfigWritesSettled() {
  while (pendingWrites.size > 0) {
    await Promise.allSettled(pendingWrites);
  }
}

async function updateTvConfig(
  configUpdate: (tvConfig: Record<string, unknown>) => Record<string, unknown>
) {
  const write = getStashTvConfig()
    .then(config => {
      return client().mutate({
        mutation: GQL.ConfigurePluginDocument,
        variables: {
          plugin_id: PLUGIN_NAMESPACE,
          input: configUpdate(config),
        }
      })
    })
  pendingWrites.add(write);
  try {
    await write;
  } finally {
    pendingWrites.delete(write);
  }
}
