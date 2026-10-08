import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PLUGIN_NAMESPACE, STASH_QUEUE_PARAMS, STASH_QUEUE_SCENE_PARAM, TV_CONFIG_STORAGE_KEY } from "../tv-ui/src/constants";
import { StashTvConfig } from "../tv-ui/src/hooks/useStashTvConfig"
import { ConfigDataFragment, ConfigInterfaceResult } from "stash-ui/dist/src/core/generated-graphql.js";
import type { CheckboxGroup } from "stash-ui/dist/src/components/Settings/SettingsInterfacePanel/CheckboxGroup";
import StashTvLogo from "../tv-ui/src/assets/stash-tv-logo.svg?react";

const { PluginApi } = window;
const { React } = PluginApi;

const graphqlClient = PluginApi.utils.StashService.getClient()

const appLink = "/plugin/" + PLUGIN_NAMESPACE + "/assets/app/";

// Run setup if first time the plugin is loaded
updateTvConfig(
  async (tvConfig) => {
    if (tvConfig?.initialSetupComplete) return null;
    await setupPlugin()
    return {
      ...tvConfig,
      initialSetupComplete: true,
    }
  }
)

// Show Stash TV in the menu bar if it's been enabled in the plugin config
PluginApi.patch.instead(
  "PluginSettings",
  function (props, _, Original) {
    const [settingResetComplete, setSettingResetComplete] = React.useState(false);
    const [stashTvConfig, setStashTvConfig] = PluginApi.React.useState<StashTvConfig | null>(null);

    if (props.pluginID !== PLUGIN_NAMESPACE) return <Original {...props} />;

    const resetStashTvSettings = async () => {
      setSettingResetComplete(false);
      await updateTvConfig(() => ({}))
      setStashTvConfig(null);
      setSettingResetComplete(true);
    }

    PluginApi.React.useEffect(() => {
      getStashConfig().then(config => setStashTvConfig(config.plugins[PLUGIN_NAMESPACE]));
    }, [])

    const isDevOptionsEnabled = PluginApi.React.useMemo(
      () => JSON.parse(
        stashTvConfig && TV_CONFIG_STORAGE_KEY in stashTvConfig && typeof stashTvConfig[TV_CONFIG_STORAGE_KEY] === "string" ? stashTvConfig[TV_CONFIG_STORAGE_KEY] : '{}'
      )?.state?.showDevOptions,
      [stashTvConfig]
    );

    // A single element rather than an array, as with the ScenePage patch below
    return (
      <>
        <Original {...props} />
        <div className="plugin-settings">
          <div className="setting"></div> {/* Dummy setting to force line between settings */}
          <div className="setting">
            <div>
              <h3>Reset all Stash TV settings</h3>
              <div className="sub-heading">
                Stash TV has its own settings which are configurable from the settings panel in the
                Stash TV interface. This resets those settings to default.
              </div>
            </div>
            <div>
              <PluginApi.libraries.Bootstrap.Button onClick={resetStashTvSettings} variant="warning">
                {settingResetComplete && <>
                  <FontAwesomeIcon
                    icon={PluginApi.libraries.FontAwesomeSolid.faCheck}
                  />
                  {" "}
                </>}
                Reset
              </PluginApi.libraries.Bootstrap.Button>
            </div>
          </div>
          {isDevOptionsEnabled && <div className="setting">
            <div>
              <details>
                <summary>
                  <h3 style={{ display: 'inline' }}>Stash TV settings JSON</h3>
                </summary>
                <pre>
                  {JSON.stringify(
                    (stashTvConfig && TV_CONFIG_STORAGE_KEY in stashTvConfig && typeof stashTvConfig[TV_CONFIG_STORAGE_KEY] === "string")
                      ? {...stashTvConfig, [TV_CONFIG_STORAGE_KEY]: '<app state data>'}
                      : stashTvConfig,
                    null,
                    2
                  )}
                </pre>
                {(stashTvConfig && TV_CONFIG_STORAGE_KEY in stashTvConfig && typeof stashTvConfig[TV_CONFIG_STORAGE_KEY] === "string") && <>
                  App state stored in Stash TV config:
                  <pre>
                    {JSON.stringify(JSON.parse(stashTvConfig[TV_CONFIG_STORAGE_KEY]), null, 2)}
                  </pre>
                </>}
              </details>
            </div>
            <div></div> {/* To stop :last-child style right-aligning this */}
          </div>}
        </div>
      </>
    );
  }
);

// Show Stash TV in the menu bar if it's been enabled in the plugin config
PluginApi.patch.instead(
  "MainNavBar.MenuItems",
  function ({ children, ...props }, _, Original) {
    const { data: stashConfig, loading: stashConfigLoading } = PluginApi.GQL.useConfigurationQuery();
    const showNavButton = stashConfig?.configuration?.interface?.menuItems?.includes('tv')

    // Add the button to the navbar
    return (
      <Original {...props}>
        {children}
        {(!stashConfigLoading && showNavButton) && <StashTVButtonInner />}
      </Original>
    );
  }
);

type CheckboxGroupProps = React.ComponentProps<typeof CheckboxGroup>

// Include Stash TV in the settings under the list of possible menu bar items to show
PluginApi.patch.before(
  "CheckboxGroup",
  function (...args: [CheckboxGroupProps]) {
    const [props, ...otherArgs] = args;
    if (props.groupId !== "menu-items") return [props, ...otherArgs];

    return [
      {
        ...props,
        items: [
          ...props.items,
          { id: "tv", headingID: "TV" },
        ],
      },
      ...otherArgs
    ];
  }
);

const StashTVButtonInner = () => {
  return (
    <div
      data-rb-event-key={appLink}
      className="col-4 col-sm-3 col-md-2 col-lg-auto nav-link"
      id="StashTVButton"
    >
      <a
        href={appLink}
        className="minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center btn btn-primary"
        target="_blank"
      >
        {/* svg-inline--fa sizes and aligns it like the other nav icons, which are FontAwesome's */}
        <StashTvLogo className="svg-inline--fa fa-icon nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0" />
        <span>TV</span>
      </a>
    </div>
  );
};

// Add a button opening the scene page's queue in Stash TV to the queue's controls. The queue viewer isn't patchable
// itself, so the button is put in its controls once they're rendered.
PluginApi.patch.instead(
  "ScenePage",
  function (props, _, Original) {
    // A single element rather than an array: Stash passes the result on to "after" patches with `args.concat(result)`,
    // which spreads an array, so another plugin's after patch reading its last argument would get only the button.
    return (
      <>
        <Original {...props} />
        <QueueTvButton />
      </>
    );
  }
);

/**
 * Stash TV's link showing the queue described by the scene page URL's search params, starting at the scene the page is
 * playing (see `getStashQueue`)
 */
export function getQueueTvLink({ pathname, search }: Pick<Location, "pathname" | "search">) {
  const sceneParams = new URLSearchParams(search);
  const queueParams = new URLSearchParams();
  for (const [key, value] of sceneParams) {
    if (STASH_QUEUE_PARAMS.includes(key)) queueParams.append(key, value);
  }
  const sceneId = pathname.match(/\/scenes\/(\d+)/)?.[1];
  if (sceneId) queueParams.set(STASH_QUEUE_SCENE_PARAM, sceneId);
  return appLink + "?" + queueParams;
}

const QueueTvButton = () => {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  // The queue's tab, and the queue viewer, can render after the page does, and be re-rendered, so watch for them.
  // Our button goes in a container of its own, first in the controls on the right (Stash only adds its own buttons
  // after or between each other's, so it stays first).
  React.useEffect(() => {
    const ourContainer = document.createElement("span");
    ourContainer.className = "stash-tv-queue-button";
    const placeContainer = () => {
      const controls = document.querySelector("#queue-viewer .queue-controls > div:last-child");
      if (controls && controls.firstChild !== ourContainer) controls.prepend(ourContainer);
    };
    placeContainer();
    setContainer(ourContainer);
    const observer = new MutationObserver(placeContainer);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      ourContainer.remove();
    };
  }, []);

  if (!container) return null;
  return PluginApi.ReactDOM.createPortal(
    <PluginApi.libraries.Bootstrap.Button
      className="minimal"
      variant="secondary"
      title="Open queue in Stash TV"
      onClick={() => window.open(getQueueTvLink(window.location), "_blank")}
    >
      <StashTvLogo className="svg-inline--fa fa-icon" />
    </PluginApi.libraries.Bootstrap.Button>,
    container
  );
};

type Config = ConfigDataFragment & { plugins: { [PLUGIN_NAMESPACE]: StashTvConfig } }

async function updateTvConfig(
  configUpdate: Partial<StashTvConfig> | (
    (tvConfig: StashTvConfig, allStashConfig: Config) => StashTvConfig | null | Promise<StashTvConfig | null>
  )
) {  getStashConfig()
    .then(async config => typeof configUpdate === "function"
          ? await configUpdate(config.plugins[PLUGIN_NAMESPACE], config)
          : {...config.plugins[PLUGIN_NAMESPACE], ...configUpdate}
    )
    .then(newConfig => {
      if (!newConfig) return;
      return graphqlClient.mutate({
        mutation: PluginApi.GQL.ConfigurePluginDocument,
        variables: {
          plugin_id: PLUGIN_NAMESPACE,
          input: newConfig,
        }
      })
    })
}

async function updateInterfaceConfig(configUpdate: Partial<ConfigInterfaceResult> | (
  (interfaceConfig: ConfigInterfaceResult) => ConfigInterfaceResult
)) {
  getStashConfig()
    .then(allStashConfig => typeof configUpdate === "function"
      ? configUpdate(allStashConfig.interface)
      : {...allStashConfig.interface, ...configUpdate}
    )
    .then(newInterfaceConfig => {
      return graphqlClient.mutate({
        mutation: PluginApi.GQL.ConfigureInterfaceDocument,
        variables: {
          input: newInterfaceConfig,
        }
      })
    })
}

async function getStashConfig() {
  const result = await graphqlClient.query({
    query: PluginApi.GQL.ConfigurationDocument,
  });
  return result.data?.configuration as Config;
}

export async function setupPlugin() {
  // Add Stash TV to nav bar menu items
  updateInterfaceConfig(
    (interfaceConfig) => ({
      ...interfaceConfig,
      menuItems: Array.from(new Set([...(interfaceConfig.menuItems || []), 'tv'])),
    })
  )
}
