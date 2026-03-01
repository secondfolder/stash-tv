import React, { memo, useEffect, useRef } from "react";
import "./Feed.scss";
import VideoScroller from "../../components/VideoScroller";
import { useTvConfig } from "../../store/tvConfig";
import SettingsTab from "../../components/settings/SettingsTab";
import { useMediaItems } from "../../hooks/useMediaItems";
import { LoadingIndicator } from "stash-ui/wrappers/components/shared/LoadingIndicator";
import { useMediaItemFilters } from "../../hooks/useMediaItemFilters";
import GuideOverlay from "../../components/GuideOverlay";
import { ErrorMessage } from "stash-ui/dist/src/components/Shared/ErrorMessage";
import cx from "classnames";
import { SettingsActionButton } from "../../components/action-buttons/buttons/SettingsActionButton";
import { useGlobalState } from "../../store/globalState";

interface FeedPageProps {
  className?: string;
}

const FeedPage: React.FC<FeedPageProps> = memo(({className}) => {
  const { showDebuggingInfo, showGuideOverlay, set: setTvConfig } = useTvConfig();
  const { showSettings, fullscreen, set: setGlobalState } = useGlobalState()
  const {
    currentMediaItemFilter,
    mediaItemFiltersLoading,
    lastLoadedCurrentMediaItemFilter,
    mediaItemFiltersError
  } = useMediaItemFilters()
  const {
    mediaItems,
    mediaItemsLoading,
    mediaItemsNeverLoaded,
    mediaItemsError,
    waitingForMediaItemsFilter
  } = useMediaItems()

  const loadedButNoScenes = !mediaItemsNeverLoaded && !mediaItemsLoading && mediaItems.length === 0

  // Show settings tab if we've finished loading scenes but have no scenes to show
  if (loadedButNoScenes && !showSettings) {
    setGlobalState("showSettings", true);
  }

    useEffect(() => {
      if (!showGuideOverlay) return;
      setGlobalState("showSettings", false);
    }, [showGuideOverlay]);

  /* ------------------------------- Fullscreen ------------------------------- */
  const initialLoad = useRef(true);
  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    if (fullscreen) {
      document.scrollingElement?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [fullscreen]);

  /* -------------------------------- component ------------------------------- */

  const statusInfo = () => {
    if (mediaItemFiltersLoading || (waitingForMediaItemsFilter && !mediaItemFiltersError)) return <LoadingIndicator message="Loading media filters..." />
    if (mediaItemsLoading) return <LoadingIndicator message="Loading filters..." />
    if (mediaItemFiltersError || mediaItemsError) {
      let message
      if (mediaItemFiltersError) {
        message = typeof mediaItemFiltersError === "object" && 'message' in mediaItemFiltersError
          ? mediaItemFiltersError.message
          : mediaItemFiltersError
      } else {
        message = typeof mediaItemsError === "object" && 'message' in mediaItemsError
          ? mediaItemsError.message
          : mediaItemsError
      }
      console.error("Error loading media items:", message);
      return (
        <ErrorMessage error={message} />
      );
    }
    const message = currentMediaItemFilter
      ? `No media found for ${currentMediaItemFilter.entityType} filter ${currentMediaItemFilter.savedFilter?.name}.`
      : "No media filter selected or loaded.";
    console.error("Error:", message);
    console.info({
      mediaItemFilters: {
        loading: mediaItemFiltersLoading,
        error: mediaItemFiltersError,
        current: currentMediaItemFilter,
        lastLoaded: lastLoadedCurrentMediaItemFilter,
      },
      mediaItems: {
        waitingForFilters: waitingForMediaItemsFilter,
        loading: mediaItemsLoading,
        neverLoaded: mediaItemsNeverLoaded,
        count: mediaItems.length,
        error: mediaItemsError,
      },
    })
    return <ErrorMessage error={message} />;
  }

  return (
  <main data-testid="FeedPage" className={cx("FeedPage", className)}>
    {mediaItems.length === 0
      ? <>
        <div className="status-info">
          {statusInfo()}
          {showDebuggingInfo.includes("onscreen-info") && <pre>
            {JSON.stringify({
              mediaItemFilters: {
                loading: mediaItemFiltersLoading,
                error: mediaItemFiltersError,
                current: currentMediaItemFilter?.savedFilter?.name || currentMediaItemFilter,
                lastLoaded: lastLoadedCurrentMediaItemFilter?.savedFilter?.name || lastLoadedCurrentMediaItemFilter,
              },
              mediaItems: {
                waitingForFilters: waitingForMediaItemsFilter,
                loading: mediaItemsLoading,
                neverLoaded: mediaItemsNeverLoaded,
                count: mediaItems.length,
                error: mediaItemsError,
              },
              showSettings,
            }, null, 2)}
          </pre>}
        </div>
        <SettingsActionButton />
      </>
      : <VideoScroller />}
    <SettingsTab />
    {showGuideOverlay && <GuideOverlay onClose={() => setTvConfig("showGuideOverlay", false)} />}
  </main>
  );
});

FeedPage.displayName = "FeedPage";

export default FeedPage;
