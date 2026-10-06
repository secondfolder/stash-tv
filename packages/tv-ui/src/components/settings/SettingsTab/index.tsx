import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faThumbtack, faTrashCan, faPenToSquare, faHeart } from "@fortawesome/free-solid-svg-icons";
import ISO6391 from "iso-639-1";
import React, { memo, useContext, useEffect, useMemo, useState } from "react";
import Select from "../Select";
import "./SettingsTab.scss";
import { DebuggingInfo, useTvConfig } from "../../../store/tvConfig";
import SideDrawer from "../SideDrawer";
import Switch from "../Switch";
import { useMediaItems } from "../../../hooks/useMediaItems";
import { useMediaItemFilters } from "../../../hooks/useMediaItemFilters";
import { Button, Form, Accordion, useAccordionToggle } from "react-bootstrap";
import { AccordionContext } from "react-bootstrap";
import cx from "classnames";
import useStashTvConfig from "../../../hooks/useStashTvConfig";
import { getLogger, LogLevel } from "@logtape/logtape";
import { getLoggers } from "../../../helpers/logging";
import { AddConfigItemButton, ConfigList, ConfigListItem } from "../ConfigList";
import { generateConfigId } from "../../../helpers/config-ids";
import objectHash from "object-hash";
import { ActionButtonSettingsModal } from "../ActionButtonSettingsModal";
import { ChannelSettings } from "../ChannelSettings";
import Slider from "../../controls/slider";
import { getFunctionFromString } from "../../../helpers/getFunctionFromString";
import { usePlaybackPositionOptions } from "../../../hooks/usePlaybackPositionOptions";
import { ActionButtonIcon, ActionButtonTitle } from "../../action-buttons/ActionButtonBase";
import { ActionButtonConfig, allButtonDefinition, getActionButtonDefinition } from "../../action-buttons/buttons";
import { createNewActionButtonConfig } from "../../action-buttons/action-button-config";
import { Arrow90degRight, ArrowLeft, Folder } from "react-bootstrap-icons";
import { ActionButtonStackConfig } from "../../action-buttons/ActionButtonStack";
import { useGlobalState } from "../../../store/globalState";

const SettingsTab = memo(() => {
  const logger = getLogger(["stash-tv", "SettingsTab"]);
  const { data: { subtitleLanguage }, update: updateStashTvConfig } = useStashTvConfig()
  const {
    mediaItemFiltersLoading,
    mediaItemFiltersError,
    currentMediaItemFilter,
  } = useMediaItemFilters()

  const {
    crtEffect,
    crtEffectStrength,
    scenePreviewOnly,
    markerPreviewOnly,
    onlyShowMatchingOrientation,
    showDevOptions,
    videoJsEventsToLog,
    logLevel,
    loggersToShow,
    loggersToHide,
    showDebuggingInfo,
    autoPlay,
    pageSize,
    startPosition,
    endPosition,
    playLength,
    minPlayLength,
    maxPlayLength,
    maxMedia,
    leftHandedUi,
    uiAutoHideDelay,
    actionButtonStackConfig,
    mediaItemsModifierFunction,
    renderedMediaItemsBuffer,
    set: setTvConfig,
    setToDefault: setDefaultAppSetting,
    getDefault: getDefaultAppSetting,
  } = useTvConfig();
  const { set: setGlobalState } = useGlobalState();
  const { mediaItems, mediaItemsLoading, mediaItemsNeverLoaded, mediaItemsError } = useMediaItems()

  const noMediaItemsAvailable = !mediaItemFiltersLoading && !mediaItemsLoading && mediaItems.length === 0

  const actionButtonStackConfigIsDefault = useMemo(() => {
    const defaultConfig = getDefaultAppSetting("actionButtonStackConfig");
    const hashOptions: objectHash.NormalOption = { excludeKeys: key => ["id"].includes(key) }
    return objectHash(actionButtonStackConfig, hashOptions) === objectHash(defaultConfig, hashOptions)
  }, [getDefaultAppSetting, actionButtonStackConfig])

  const [displayedModal, setDisplayedModal] = useState<"action-button-settings" | null>(null);


  /* ---------------------------------- Forms --------------------------------- */

  // Set subtitles language
  const subtitlesList = ISO6391.getAllNames()
    .map((name) => ({
      label: name,
      value: ISO6391.getCode(name),
    }))
    .sort((a, b) => {
      if (a.label < b.label) {
        return -1;
      }
      if (a.label > b.label) {
        return 1;
      }
      return 0;
    });

  const defaultSubtitles = subtitleLanguage
    ? {
      label: ISO6391.getName(subtitleLanguage),
      value: subtitleLanguage,
    }
    : undefined;

  const titleRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!titleRef.current) return;
    let clearClickCountTimer: NodeJS.Timeout | undefined;
    let clickCount = 0
    const handlePointerUp = () => {
      clickCount += 1;
      if (clickCount > 4) {
        setTvConfig("showDevOptions", true);
      }
      clearTimeout(clearClickCountTimer);
      clearClickCountTimer = setTimeout(() => {
        clickCount = 0;
      }, 1000);
    };
    titleRef.current.addEventListener("pointerup", handlePointerUp)
    return () => {
      titleRef.current?.removeEventListener("pointerup", handlePointerUp)
    }

  }, [titleRef])

  const isFirstLoad = mediaItemsNeverLoaded && !mediaItemFiltersError && !mediaItemsError
  let disableClose: boolean | "because loading" = false;
  if (!isFirstLoad && (mediaItemFiltersLoading || mediaItemsLoading)) {
    disableClose = "because loading";
  } else if (!isFirstLoad && noMediaItemsAvailable) {
    disableClose = true;
  } else if (mediaItemsError || mediaItemFiltersError) {
    disableClose = true;
  }

  const { startPositionOptions, endPositionOptions } = usePlaybackPositionOptions()

  const uiAutoHideDelayOptions = [0, 1, 2, 3, 5, 10].map(seconds => ({
    value: seconds,
    label: seconds ? `After ${seconds} second${seconds === 1 ? "" : "s"}` : "Off",
  }));

  const logLevelOptions = useMemo(() => (
    Object.entries(
      {
        "trace": "Trace (most verbose)",
        "debug": "Debug",
        "info": "Info",
        "warning": "Warning",
        "error": "Error",
        "fatal": "Fatal (least verbose)",
      } satisfies { [K in LogLevel]: string; }
    ).map(([value, label]) => ({
      value: value as LogLevel,
      label,
    }))
  ), []);

  const [loggers, setLoggers] = React.useState(getLoggers());
  useEffect(() => {
    const interval = setInterval(() => {
      const newLoggers = getLoggers().filter(newLogger => !loggers.includes(newLogger))
      if (newLoggers.length === 0) return;
      setLoggers([
        ...loggers,
        ...newLoggers
      ]);
    }, 1000);
    return () => clearInterval(interval);
  }, [loggers]);

  const loggerOptions = useMemo(() => loggers
    .map(logger => logger.category)
    .filter(category =>
      category.length // Exclude root logger
      && category[0] !== "logtape" // Exclude logtape internal loggers
      && (category.length !== 1 || category[0] !== "stash-tv") // Exclude root stash-tv logger
    )
    .map(category => ({
      value: category,
      label: category.join(" / ").replace(/^stash-tv \/ /, ""),
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label))
  , [loggers]);

  const showDebuggingInfoOptions = useMemo(() => (
    Object.entries(
      {
        "render-debugging": "Render Debugging",
        "onscreen-info": "On-screen Info",
        "virtualizer-debugging": "Virtualizer Debugging",
      } satisfies { [K in DebuggingInfo]: string; }
    ).map(([value, label]) => ({
      value: value as DebuggingInfo,
      label,
    }))
  ), []);

  const [actionButtonDraft, setActionButtonDraft] = React.useState<ActionButtonConfig | null>(null);
  useEffect(() => setDisplayedModal(actionButtonDraft ? "action-button-settings" : null), [actionButtonDraft])

  const isInActionButtonStack = (actionButton: ActionButtonConfig) => actionButtonStackConfig.some(config =>
    config.id === actionButton.id
    || (config.type === "folder" && config.contents.some(button => button.id === actionButton.id))
  );

  const saveActionButtonDraft = (actionButton: ActionButtonConfig) => {
    if (isInActionButtonStack(actionButton)) {
      // The button may be at the top level or inside a folder
      setTvConfig(
        "actionButtonStackConfig",
        actionButtonStackConfig.map(config => {
          if (config.id === actionButton.id) return actionButton
          if (config.type === "folder") {
            return {
              ...config,
              contents: config.contents.map(button => button.id === actionButton.id ? actionButton : button),
            }
          }
          return config
        })
      );
    } else {
      setTvConfig(
        "actionButtonStackConfig",
        [...actionButtonStackConfig, {...actionButton, id: generateConfigId()}]
      );
    }
  }

  const addableActionButtons = allButtonDefinition
    .map((definition) => {
      return {
        definition,
        isRepeatable: 'isRepeatable' in definition && definition.isRepeatable,
        add() {
          const options = {
            includeMarkerDefaults: false
          }
          if (definition.id === "create-marker" && actionButtonStackConfig.some(config => config.type === "button" && config.buttonType === "create-marker")) {
            options.includeMarkerDefaults = true
          }
          const config = createNewActionButtonConfig(definition.id, options);

          const buttonDefinition = getActionButtonDefinition(definition.id)

          if ('settings' in buttonDefinition.components) {
            setActionButtonDraft(config);
          } else {
            setTvConfig("actionButtonStackConfig", [...actionButtonStackConfig, config]);
          }
        }
      }
    })
    .filter((v): v is (Exclude<typeof v, null>) => v !== null)
    // Exclude singleton button types that are already displayed
    .filter(
      actionButton =>
        !actionButtonStackConfig.some(config =>
          (config.type === "button" && config.buttonType === actionButton.definition.id)
          || (config.type === "folder" && config.contents.some(config =>
            config.type === "button" && config.buttonType === actionButton.definition.id
          ))
        )
        || actionButton.isRepeatable
    )

  const hydratedMediaItemsModifierFunction = mediaItemsModifierFunction && getFunctionFromString(mediaItemsModifierFunction)
  const mediaItemsModifierFunctionValidity = useMemo(() => {
    if (!hydratedMediaItemsModifierFunction) return ""
    if (hydratedMediaItemsModifierFunction instanceof Error) {
      return hydratedMediaItemsModifierFunction.message
    }
    try {
      if (!Array.isArray(hydratedMediaItemsModifierFunction([]))) {
        return "Does not return an array"
      }
    } catch(error) {
      return `Threw an error when run: ${error}`
    }
    return ""
  }, [hydratedMediaItemsModifierFunction])


    const editableActionButtonStackConfig = useMemo(() =>
      actionButtonStackConfig
        .toReversed()
        .map(item => {
          if (item.type === "folder") {
            return {
              ...item,
              contents: item.contents.toReversed()
            }
          }
          return item
        })
        .toSorted((a, b) => (a.pinned ? 1 : 0) - (b.pinned ? 1 : 0)),
      [actionButtonStackConfig]
    )
    const updateEditableActionButtonStackConfig = ((newConfig: ActionButtonStackConfig[]) => {
      newConfig = newConfig
        .toReversed()
        .map(item => {
          if (item.type === "folder") {
            return {
              ...item,
              contents: item.contents.toReversed()
            }
          }
          return item
        })
      const indexOfFirstNonPinned = newConfig.findIndex(config => !config.pinned)
      newConfig = newConfig
        // If we move any pinned config items above a non-pinned one, unpin it.
        .map((config, index) => ({
          ...config,
          pinned: config.pinned && index >= indexOfFirstNonPinned ? false : config.pinned,
        }))
      setTvConfig(
        "actionButtonStackConfig",
        newConfig
      )
    })

  /* -------------------------------- Component ------------------------------- */
  return <SideDrawer
    title={useMemo(() => <span ref={titleRef}>Settings</span>, [])}
    closeDisabled={disableClose}
    className="SettingsTab"
  >
    {displayedModal === "action-button-settings" && actionButtonDraft && <ActionButtonSettingsModal
      initialActionButtonConfig={actionButtonDraft}
      operation={isInActionButtonStack(actionButtonDraft) ? "edit" : "add"}
      onClose={() => setActionButtonDraft(null)}
      onSave={config => {
        saveActionButtonDraft(config)
        setActionButtonDraft(null)
      }}
    />}
    <Accordion defaultActiveKey="0">
      <AccordionToggle eventKey="0">
        Channels
      </AccordionToggle>
      <Accordion.Collapse eventKey="0">
        <>
          <ChannelSettings />
          {mediaItemFiltersError ? (
            <div className="error">
              <h2>An error occurred loading the channel.</h2>
              <p>
                {mediaItemFiltersError instanceof Error ? mediaItemFiltersError.message : "Try reloading the page."}
              </p>
            </div>
          ) : null}
          {noMediaItemsAvailable && (
            <div className="error">
              <h2>Channel contains no media!</h2>
              <p>
                No media was found for the current channel. Please choose a different one.
              </p>
            </div>
          )}

          <Form.Group>
            <Switch
              id="only-show-matching-orientation"
              label="Only Show Scenes Matching Orientation"
              checked={onlyShowMatchingOrientation}
              onChange={event => setTvConfig("onlyShowMatchingOrientation", event.target.checked)}
            />
            <Form.Text className="text-muted">Limit scenes to only those in the same orientation as the current window.</Form.Text>
          </Form.Group>
        </>
      </Accordion.Collapse>
      <AccordionToggle eventKey="1">
        Media Player
      </AccordionToggle>
      <Accordion.Collapse eventKey="1">
        <>
          <Form.Group>
            <Switch
              id="auto-play"
              label="Auto Play"
              checked={autoPlay}
              onChange={event => setTvConfig("autoPlay", event.target.checked)}
            />
            <Form.Text className="text-muted">Automatically play scenes.</Form.Text>
          </Form.Group>

          {currentMediaItemFilter?.entityType === "scene" && (
            <Form.Group>
              <Switch
                id="scene-preview-only"
                label="Scene Preview Only"
                checked={scenePreviewOnly}
                onChange={event => setTvConfig("scenePreviewOnly", event.target.checked)}
              />
              <Form.Text className="text-muted">Play a short preview rather than the full scene. (Requires the preview files to have been generated in Stash for a scene otherwise the full scene will be shown.)</Form.Text>
            </Form.Group>
          )}
          {currentMediaItemFilter?.entityType === "marker" && (
            <Form.Group>
              <Switch
                id="marker-preview-only"
                label="Play Low-res Preview"
                checked={markerPreviewOnly}
                onChange={event => setTvConfig("markerPreviewOnly", event.target.checked)}
              />
              <Form.Text className="text-muted">Play the low-resolution marker preview which can be useful for low bandwidth situations. (Requires the preview files to have been generated in Stash for a marker otherwise the full-quality video will be shown.)</Form.Text>
            </Form.Group>
          )}

          {(!currentMediaItemFilter || currentMediaItemFilter.entityType === "scene") && !scenePreviewOnly && <>
            <Form.Group>
              <label htmlFor="start-position">
                Play From…
              </label>
              <Select<typeof startPositionOptions[number]>
                inputId="start-position"
                value={startPositionOptions.find(option => option.value === startPosition) ?? null}
                onChange={(newValue: typeof startPositionOptions[number] | null) => newValue && setTvConfig("startPosition", newValue.value)}
                options={startPositionOptions}
              />
              <Form.Text className="text-muted">
                The point in the scene to start playback from.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="end-position">
                End Play After…
              </label>
              <Select<typeof endPositionOptions[number]>
                inputId="end-position"
                value={endPositionOptions.find(option => option.value === endPosition) ?? null}
                onChange={(newValue: typeof endPositionOptions[number] | null) => newValue && setTvConfig("endPosition", newValue.value)}
                options={endPositionOptions}
              />
              <Form.Text className="text-muted">
                The point in the scene to end playback.
              </Form.Text>

              {endPosition === "fixed-length" && <Form.Group>
                <label htmlFor="play-length">
                  Play Length (Seconds)
                </label>
                <Form.Control
                  type="number"
                  id="play-length"
                  className="text-input"
                  value={playLength ?? ""}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setTvConfig(
                      "playLength",
                      event.currentTarget.value
                        ? Number.parseInt(event.currentTarget.value)
                        : undefined
                    )
                  }
                />
                <Form.Text className="text-muted">
                  The length to play the scene for after the start point. Will play the full scene if not set.
                </Form.Text>
              </Form.Group>}

              {endPosition === "random-length" && <Form.Group>
                <label>
                  Random Play Length Range (Seconds)
                </label>
                <div className="inline">
                  <label htmlFor="min-play-length" className="sr-only">
                    Random Length Minimum
                  </label>
                  <Form.Control
                    type="number"
                    id="min-play-length"
                    className="text-input"
                    placeholder="Min"
                    value={minPlayLength ?? ""}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setTvConfig(
                        "minPlayLength",
                        event.currentTarget.value
                          ? Number.parseInt(event.currentTarget.value)
                          : undefined
                      )
                    }
                  />
                  <label htmlFor="max-play-length" className="sr-only">
                    Random Length Maximum
                  </label>
                  <Form.Control
                    type="number"
                    id="max-play-length"
                    className="text-input"
                    value={maxPlayLength ?? ""}
                    placeholder="Max"
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      setTvConfig(
                        "maxPlayLength",
                        event.currentTarget.value
                          ? Number.parseInt(event.currentTarget.value)
                          : undefined
                      )
                    }
                  />
                </div>
                <Form.Text className="text-muted">
                  Sets the minimum and maximum length to randomly play the scene for.
                </Form.Text>
              </Form.Group>}
            </Form.Group>
          </>}

          <Form.Group>
            <label htmlFor="subtitle-language">
              Subtitle Language
            </label>
            <Select<{ label: string; value: string }>
              inputId="subtitle-language"
              value={defaultSubtitles}
              onChange={(newValue: { label: string; value: string } | null) => {
                if (!newValue) return;
                updateStashTvConfig(
                  {
                    subtitleLanguage: newValue.value,
                  }
                );
              }}
              options={subtitlesList}
              placeholder="Select a subtitle language"
            />
            <Form.Text className="text-muted">
              Select the language to use for subtitles if available.
            </Form.Text>
          </Form.Group>

          <Form.Group>
            <Switch
              id="crt-effect"
              label="CRT Effect"
              checked={crtEffect}
              onChange={event => setTvConfig("crtEffect", event.target.checked)}
            />
            <Form.Text className="text-muted">Emulate the visual effects of an old CRT television.</Form.Text>
            {crtEffect && <Form.Group>
              <Slider
                id="crt-effect-strength"
                min={0}
                max={1}
                step={0.2}
                marks
                value={[crtEffectStrength]}
                onValueChange={e => setTvConfig("crtEffectStrength", Number(e[0]))}
              />
              <Form.Text className="text-muted">Adjusts how strong the CRT effect is.</Form.Text>
            </Form.Group>}
          </Form.Group>
        </>
      </Accordion.Collapse>
      <AccordionToggle eventKey="2">
        UI
      </AccordionToggle>
      <Accordion.Collapse eventKey="2">
        <>
          <Form.Group>
            <Switch
              id="left-handed-ui"
              label="Left-handed UI"
              checked={leftHandedUi}
              onChange={event => setTvConfig("leftHandedUi", event.target.checked)}
            />
            <Form.Text className="text-muted">Flip the user interface for left-handed use.</Form.Text>
          </Form.Group>
          <Form.Group>
            <label htmlFor="ui-auto-hide-delay">
              Auto-hide UI
            </label>
            <Select<typeof uiAutoHideDelayOptions[number]>
              inputId="ui-auto-hide-delay"
              value={uiAutoHideDelayOptions.find(option => option.value === uiAutoHideDelay) ?? null}
              onChange={(newValue: typeof uiAutoHideDelayOptions[number] | null) => newValue && setTvConfig("uiAutoHideDelay", newValue.value)}
              options={uiAutoHideDelayOptions}
            />
            <Form.Text className="text-muted">
              When using a mouse, fade out the UI after this long without any interaction.
            </Form.Text>
          </Form.Group>
          <Form.Group>
            <label>Action Buttons</label>

            <ConfigList<ActionButtonStackConfig>
              className="action-button-list"
              items={editableActionButtonStackConfig}
              onItemsOrderChange={updateEditableActionButtonStackConfig}
              nestingKey="contents"
              renderItem={({
                item,
                items,
                getDragHandleProps,
                nestedChildren,
                currentNestingParent,
                previousNestingParent,
                updateList
              }) => {
                const configType = item.type
                if (item.type === "folder") {
                  return (
                    <ConfigListItem
                      className="folder"
                      dragHandleProps={getDragHandleProps({className: "drag-handle"})}
                      icon={<ActionButtonIcon
                        iconDefinition={Folder}
                        state="inactive"
                        size="small"
                      />}
                      title="Folder"
                      controls={<Button
                        variant="link"
                        className={cx("hide-button", "muted")}
                        onClick={() => updateList(items.filter(listItem => listItem !== item))}
                      >
                        <FontAwesomeIcon icon={faTrashCan} />
                      </Button>}
                    >
                      {!item.contents.length && <div className="text-muted instructions">
                        (click <Arrow90degRight /> on items below to add to folder)
                      </div>}
                      {nestedChildren}
                    </ConfigListItem>
                  )
                } else if (item.type !== "button") {
                  item satisfies never;
                  logger.error(`Unsupported action button config type ${configType}`, {item})
                  return null
                }
                const buttonDefinition = getActionButtonDefinition(item.buttonType)
                if (!buttonDefinition) {
                  logger.error(`No button definition found for action button config type ${item.buttonType}`, {item})
                  return null
                }

                const dragHandleProps = getDragHandleProps({className: "drag-handle"})
                const isDeletable = item.buttonType !== "settings"
                const isPinnable = !currentNestingParent
                const isInsideFolder = currentNestingParent
                const canAddToFolder = previousNestingParent && item.buttonType !== "settings" && item.buttonType !== "ui-visibility"

                return <ConfigListItem
                  dragHandleProps={items.length > 1 ? dragHandleProps : undefined}
                  icon={<ActionButtonIcon
                    iconDefinition={buttonDefinition.icon}
                    state="inactive"
                    size="small"
                    config={item}
                  />}
                  title={<ActionButtonTitle
                    title={buttonDefinition.title}
                    state="inactive"
                    config={item}
                  />}
                  controls={<>
                    {'settings' in buttonDefinition.components && <Button
                      variant="link"
                      className={cx("settings", "muted")}
                      onClick={() => setActionButtonDraft(item)}
                      aria-label="Edit button settings"
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                    </Button>}
                    {canAddToFolder && <Button
                      variant="link"
                      className={cx("add-to-folder", "muted")}
                      onClick={() => updateEditableActionButtonStackConfig(
                        editableActionButtonStackConfig
                          .map((config) => {
                            if (config === previousNestingParent && config.type === "folder") {
                              return {
                                ...config,
                                contents: [...config.contents, item]
                              }
                            } else if (config === item) {
                              return null
                            }
                            return config
                          })
                          .filter((v): v is (Exclude<typeof v, null>) => v !== null)
                      )}
                    >
                      <Arrow90degRight />
                    </Button>}
                    {isDeletable && <Button
                      variant="link"
                      className={cx("hide-button", "muted")}
                      onClick={() => updateList(items.filter(listItem => listItem !== item))}
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                    </Button>}
                    {isInsideFolder && <Button
                      variant="link"
                      className={cx("remove-from-folder", "muted")}
                      onClick={() => updateEditableActionButtonStackConfig(
                        editableActionButtonStackConfig
                          .flatMap((config) => {
                            if (config.type === "folder" && config.contents.some(config => config === item)) {
                              return [
                                {
                                  ...config,
                                  contents: config.contents.filter(config => config !== item)
                                },
                                item,
                              ]
                            }
                            return config
                          })
                      )}
                    >
                      <ArrowLeft />
                    </Button>}
                    {isPinnable && <Button
                      variant="link"
                      className={cx("pin-button", {muted: !item.pinned})}
                      onClick={() => {
                        const updatedConfig = editableActionButtonStackConfig
                          .map((config) =>
                            config.type === "button" && config.id === item.id
                              ? {...config, pinned: !config.pinned}
                              : config
                          )
                        // Ensure all pinned config is at the bottom
                        updateEditableActionButtonStackConfig([
                          ...updatedConfig.filter(config => !config.pinned),
                          ...updatedConfig.filter(config => config.pinned),
                        ])
                      }}
                    >
                      <FontAwesomeIcon icon={faThumbtack} />
                    </Button>}
                  </>}
                />
              }}
              getItemKey={(item) => item.id}
            />
            <div className="form-subgroup">
              {addableActionButtons.map(actionButton => (
                <AddConfigItemButton
                  key={actionButton.definition.id}
                  className="add-action-button"
                  onClick={() => actionButton.add()}
                  icon={<ActionButtonIcon
                    iconDefinition={actionButton.definition.icon}
                    state="inactive"
                    size="small"
                  />}
                  title={<ActionButtonTitle
                    title={actionButton.definition.title}
                    state="inactive"
                  />}
                />
              ))}
              <AddConfigItemButton
                className="add-folder"
                onClick={() => setTvConfig("actionButtonStackConfig", [...actionButtonStackConfig, {id: generateConfigId(), type: "folder", pinned: false, contents: []}])}
                icon={<ActionButtonIcon
                  iconDefinition={Folder}
                  state="inactive"
                  size="small"
                />}
                title={<ActionButtonTitle
                  title="New Folder"
                  state="inactive"
                />}
              />
            </div>
            {!actionButtonStackConfigIsDefault && <div className="inline form-subgroup">
              <Button
                variant="outline-warning"
                onClick={() => setDefaultAppSetting('actionButtonStackConfig')}
              >
                Reset to default
              </Button>
            </div>}
            <Form.Text className="text-muted">
              Pinning buttons stops them from being pushed off screen when the window is not tall enough to show them
              all without scrolling.
            </Form.Text>
          </Form.Group>
        </>
      </Accordion.Collapse>
      <AccordionToggle eventKey="3">
        Help / Info
      </AccordionToggle>
      <Accordion.Collapse eventKey="3">
        <>
          <Form.Group className="inline">
            <Button
              onClick={() => setTvConfig('showGuideOverlay', true)}
            >
              Show Guide
            </Button>
            <Form.Text className="text-muted">Show instructions for using Stash TV.</Form.Text>
          </Form.Group>
          <Form.Group className="inline">
            <Button
              onClick={() => setGlobalState("keyboardShortcutsOpen", true)}
            >
              Show Keyboard Shortcuts
            </Button>
            <Form.Text className="text-muted">Show keyboard shortcuts for Stash TV.</Form.Text>
          </Form.Group>
          <Form.Group>
            <strong>Version:</strong> {import.meta.env.VITE_STASH_TV_VERSION}
          </Form.Group>
          <Form.Group className="inline">
            <p>
              Want to support Stash TV's development?
              You can donate via <a href="https://ko-fi.com/secondfolder" target="_blank" rel="noopener noreferrer">Ko-Fi</a>
              {" "}or <a href="https://github.com/sponsors/secondfolder" target="_blank" rel="noopener noreferrer">GitHub Sponsors</a>. Thanks!
            </p>
            <FontAwesomeIcon icon={faHeart} className="accent-icon large-icon" />
          </Form.Group>
        </>
      </Accordion.Collapse>


      {showDevOptions && <>
        <AccordionToggle eventKey="4">
          Developer Options
        </AccordionToggle>
        <Accordion.Collapse eventKey="4">
          <>
            <Form.Group>
              <Switch
                id="show-dev-options"
                label="Hide Developer Options"
                checked={showDevOptions}
                onChange={event => setTvConfig("showDevOptions", false)}
              />
              <Form.Text className="text-muted">Hide developer options.</Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="log-level">
                Log Level to Show
              </label>
              <Select<{ value: LogLevel; label: string }>
                inputId="log-level"
                value={logLevelOptions.find(option => option.value === logLevel) ?? null}
                onChange={(newValue: { value: LogLevel; label: string } | null) => newValue?.value && setTvConfig("logLevel", newValue.value)}
                options={logLevelOptions}
              />
              <Form.Text className="text-muted">The level of logging detail.</Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="loggers-to-show">
                Loggers to Show
              </label>
              <Select<{ value: string[]; label: string }, true>
                inputId="loggers-to-show"
                expandWidthToFit={true}
                options={loggerOptions}
                value={loggerOptions.filter(
                  ({value: category}) => loggersToShow.some(
                    shownCategory => (category.length === shownCategory.length) && category.every(
                      (part, index) => part === shownCategory[index]
                    )
                  )
                )}
                onChange={(newValues: readonly { value: string[]; label: string }[]) => setTvConfig("loggersToShow", newValues.map((option) => option.value))}
                isMulti={true}
                closeMenuOnSelect={false}
              />
              <Form.Text className="text-muted">Loggers to show logs from. An empty list will show any that aren't otherwise hidden.</Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="loggers-to-hide">
                Loggers to Hide
              </label>
              <Select<{ value: string[]; label: string }, true>
                inputId="loggers-to-hide"
                expandWidthToFit={true}
                options={loggerOptions}
                value={loggerOptions.filter(
                  ({value: category}) => loggersToHide.some(
                    hiddenCategory => (category.length === hiddenCategory.length) && category.every(
                      (part, index) => part === hiddenCategory[index]
                    )
                  )
                )}
                placeholder="All loggers"
                onChange={(newValues: readonly { value: string[]; label: string }[]) => setTvConfig("loggersToHide", newValues.map((option) => option.value))}
                isMulti={true}
                closeMenuOnSelect={false}
              />
              <Form.Text className="text-muted">Loggers to hide logs from.</Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="video-js-events-to-log">
                Video.js Events To Log
              </label>
              <Select<{ label: string; value: string }, true>
                inputId="video-js-events-to-log"
                value={videoJsEventsToLog.map(eventName => ({
                  label: eventName,
                  value: eventName,
                }))}
                onChange={(newValue: readonly { label: string; value: string }[]) => setTvConfig(
                  "videoJsEventsToLog",
                  newValue.some((item) => item.value === "all") ? videoJsEvents : newValue.map((item) => item.value)
                )}
                options={["all", ...videoJsEvents].map(eventName => ({
                  label: eventName,
                  value: eventName,
                }))}
                placeholder="Select video.js events to log"
                isMulti={true}
                closeMenuOnSelect={false}
              />
              <Form.Text className="text-muted">
                Which video.js events to log to the console.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="show-debugging-info">
                Additional Debugging Info
              </label>
              <Select<{ value: DebuggingInfo; label: string }, true>
                inputId="show-debugging-info"
                value={showDebuggingInfoOptions.filter(option => showDebuggingInfo.includes(option.value))}
                onChange={(newValues: readonly { value: DebuggingInfo; label: string }[]) => setTvConfig("showDebuggingInfo", newValues.map((option) => option.value))}
                options={showDebuggingInfoOptions}
                isMulti={true}
                closeMenuOnSelect={false}
              />
              <Form.Text className="text-muted">Additional debugging information.</Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="page-size">
                Media Loading Page Size
              </label>
              <Form.Control
                type="number"
                id="page-size"
                className="text-input"
                value={pageSize}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const newSize = Number.parseInt(event.currentTarget.value)
                  if (isNaN(newSize) || newSize < 1) return;
                  setTvConfig("pageSize", newSize)
                }}
              />
              <Form.Text className="text-muted">
                (Reload page to take effect.)
                Load this many media at a time. Default is {getDefaultAppSetting("pageSize")}. Changing this can impact performance.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="max-media">
                Limit Number of Media in Media Filter
              </label>
              <Form.Control
                type="number"
                id="max-media"
                className="text-input"
                value={maxMedia ?? ""}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setTvConfig(
                    "maxMedia",
                    event.currentTarget.value
                      ? Number.parseInt(event.currentTarget.value)
                      : undefined
                  )
                }
              />
              <Form.Text className="text-muted">
                Normally the feed can be scrolled till all media in the media filter have been displayed. But with this
                set only this many media will be displayed.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="max-media">
                Upcoming media to render at a time
              </label>
              <Form.Control
                type="number"
                id="max-media"
                className="text-input"
                value={renderedMediaItemsBuffer}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setTvConfig(
                    "renderedMediaItemsBuffer",
                    event.currentTarget.value
                      ? Number.parseInt(event.currentTarget.value)
                      : 0
                  )
                }
              />
              <Form.Text className="text-muted">
                The maximum number of media upcoming media to be rendered off screen. Default is {getDefaultAppSetting("renderedMediaItemsBuffer")}. Changing this can impact performance.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <label htmlFor="media-items-modifier-function">
                Media Items Modifier Function
              </label>
              <Form.Control
                as="textarea"
                id="media-items-modifier-function"
                className="text-input"
                value={mediaItemsModifierFunction}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setTvConfig(
                    "mediaItemsModifierFunction",
                    event.currentTarget.value
                  )
                }
                placeholder={"(mediaItems) => {\n  return mediaItems.toReversed()\n}"}
              />
              {mediaItemsModifierFunctionValidity && <div>
                {mediaItemsModifierFunctionValidity}
              </div>}
              <Form.Text className="text-muted">
                A JavaScript function that can be used to modified the content and ordering of the displayed media items.
                The function is given the media items array as an argument and it must return an array of media items.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <Button
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </Form.Group>
          </>
        </Accordion.Collapse>
      </>}
    </Accordion>

  </SideDrawer>;
});

SettingsTab.displayName = "SettingsTab";
export default SettingsTab;

const AccordionToggle = (props: any) => {
  const {children, className, as, variant, eventKey, ...otherProps} = props;
  const contextEventKey = useContext(AccordionContext);
  const open = contextEventKey === eventKey;
  const decoratedOnClick = useAccordionToggle(eventKey);
  return (
    <Accordion.Toggle className={cx(className, open ? 'open' : '')} as={Button} variant="link" eventKey={eventKey} {...otherProps}>
      <h3>
        <span>{children}</span>
        <FontAwesomeIcon icon={faChevronLeft} />
      </h3>
    </Accordion.Toggle>
  )
}

// Taken from: https://gist.github.com/alexrqs/a6db03bade4dc405a61c63294a64f97a?permalink_comment_id=4312389#gistcomment-4312389
const videoJsEvents = [...new Set([
  // HTMLMediaElement events
  'abort',
  'canplay',
  'canplaythrough',
  'durationchange',
  'emptied',
  'ended',
  'error',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'pause',
  'play',
  'playing',
  'progress',
  'ratechange',
  'seeked',
  'seeking',
  'stalled',
  'suspend',
  'timeupdate',
  'volumechange',
  'waiting',

  // HTMLVideoElement events
  'enterpictureinpicture',
  'leavepictureinpicture',

  // Element events
  'fullscreenchange',
  'resize',

  // video.js events
  'audioonlymodechange',
  'audiopostermodechange',
  'controlsdisabled',
  'controlsenabled',
  'debugon',
  'debugoff',
  'disablepictureinpicturechanged',
  'dispose',
  'enterFullWindow',
  'error',
  'exitFullWindow',
  'firstplay',
  'fullscreenerror',
  'languagechange',
  'loadedmetadata',
  'loadstart',
  'playerreset',
  'playerresize',
  'posterchange',
  'ready',
  'textdata',
  'useractive',
  'userinactive',
  'usingcustomcontrols',
  'usingnativecontrols',
])];
