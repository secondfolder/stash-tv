import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./VideoScroller.scss";
import VideoItem from "../VideoItem";
import cx from "classnames";
import { useAppStateStore } from "../../store/appStateStore";
import { useVirtualizer, useWindowVirtualizer, windowScroll, elementScroll } from "@tanstack/react-virtual";
import throttle from 'throttleit';
import { clamp } from "../../helpers";
import { useMediaItems } from "../../hooks/useMediaItems";
import { useWindowSize } from "../../hooks/useWindowSize";

interface VideoScrollerProps {}

const videoItemHeight = "calc(var(--y-unit-large) * 100)"

export type ScrollToIndexOptions = { behavior?: ScrollBehavior }

/** The number of items to fetch data for. */
export const itemBufferEitherSide = 1 as const;

const VideoScroller: React.FC<VideoScrollerProps> = () => {
  const { forceLandscape: isForceLandscape, onlyShowMatchingOrientation, debugMode, set: setAppSetting } = useAppStateStore();
  const { orientation } = useWindowSize()
  const rootElmRef = useRef<HTMLDivElement | null>(null);

  /* ------------------------ Handle loading new videos ----------------------- */


  const { mediaItems, loadMoreMediaItems } = useMediaItems();

  const estimateSizeTesterElement = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    return () => {
      if (estimateSizeTesterElement.current) {
        estimateSizeTesterElement.current.remove();
        estimateSizeTesterElement.current = null;
      }
    }
  }, []);


  const sharedOptions = {
    count: mediaItems.length,
    estimateSize: () => {
      if (!estimateSizeTesterElement.current) {
        const el = document.createElement('div');
        el.style.height = videoItemHeight;
        el.style.position = 'absolute';
        el.className = "VideoScroller--size-tester";
        el.style.visibility = 'hidden';
        document.body.appendChild(el);
        estimateSizeTesterElement.current = el;
      }

      const itemHeight = estimateSizeTesterElement.current.offsetHeight;
      debugMode && console.log("Estimated item height:", itemHeight)

      return itemHeight;
    },
    overscan: itemBufferEitherSide,
  }
  const windowRowVirtualizer = useWindowVirtualizer({
    ...sharedOptions,
    enabled: !isForceLandscape,
    scrollToFn: (...args) => {
      debugMode && console.log("Window virtualizer scrolling to height:", args[0])
      return windowScroll(...args);
    }
  });
  const elementRowVirtualizer = useVirtualizer({
    ...sharedOptions,
    enabled: isForceLandscape,
    getScrollElement: () => document.querySelector('body'),
    scrollToFn: (...args) => {
      debugMode && console.log("Element virtualizer scrolling to height:", args[0])
      return elementScroll(...args);
    }
  });
  
  const rowVirtualizer = isForceLandscape ? elementRowVirtualizer : windowRowVirtualizer;

  const [currentIndex, _setCurrentIndex] = useReducer(
    (currentState: number, newState: React.SetStateAction<number>) => {
      newState = typeof newState === 'function' ? newState(currentState) : newState;
      return clamp(0, newState, mediaItems.length ? mediaItems.length - 1 : 0);
    },
    0
  );
  
  /**
   * The currentIndex value in ref form for when it needs to be accessed in
   * async functions without being a dependency that causes re-renders.
   *
   * It's state may sometimes differ from currentIndex as the updating of currentIndex
   * is throttled to avoid excessive re-renders. However currentIndex should eventually
   * catch up to this value.
   * */
  const currentIndexRef = useRef(currentIndex);

  const setCurrentIndex = useMemo(
    () => {
      const throttledSetCurrentIndex = throttle((newIndex: number) => {
        debugMode && console.log("setCurrentIndex received:", newIndex)
        _setCurrentIndex(newIndex)
      }, 100)
      return ((newIndex: React.SetStateAction<number>) => {
        currentIndexRef.current = clamp(
          0,
          typeof newIndex === 'function' ? newIndex(currentIndexRef.current) : newIndex,
          mediaItems.length ? mediaItems.length - 1 : 0
        );

        return throttledSetCurrentIndex(currentIndexRef.current);
      })
    },
    [rowVirtualizer, mediaItems.length]
  );

  const scrollSnappingReenableTimeoutRef = useRef<NodeJS.Timeout | undefined>();
  const scrollSnappingEnabled = () => !scrollSnappingReenableTimeoutRef.current
  const scrollSnappingReenableTimeoutMs = 100;
  const getScrollSnappingReenableHandler = () => () => {
    clearTimeout(scrollSnappingReenableTimeoutRef.current);
    scrollSnappingReenableTimeoutRef.current = undefined
    rootElmRef.current?.classList.add('scrollSnappingEnabled');
  }

  // Temporarily disable scroll snapping to help with bugs that occur when trying to programmatically scroll
  // when scroll snapping is on. Also if scroll snapping is enabled when page is loaded then iOS restores the scroll
  // position so we disable it for a short while at load to avoid this.
  function temporarilyDisableScrollSnapping() {
    if (scrollSnappingReenableTimeoutRef.current) {
      clearTimeout(scrollSnappingReenableTimeoutRef.current);
    }
    scrollSnappingReenableTimeoutRef.current = setTimeout(
      getScrollSnappingReenableHandler(),
      scrollSnappingReenableTimeoutMs
    );
    debugMode && console.log('Temporarily disabling scroll snapping');
    rootElmRef.current?.classList.remove('scrollSnappingEnabled');
  }

  // Delay reenabling scroll snapping if a scroll occurs within the timeout period
  useEffect(() => {
    const scrollHandler = () => {
      if (!scrollSnappingEnabled()) {
        clearTimeout(scrollSnappingReenableTimeoutRef.current);
        scrollSnappingReenableTimeoutRef.current = setTimeout(
          getScrollSnappingReenableHandler(),
          scrollSnappingReenableTimeoutMs
        );
      }
    }
    window.addEventListener('scroll', scrollHandler);
    return () => window.removeEventListener('scroll', scrollHandler);
  }, []);
  const scrollToIndex = useCallback(
    (index: React.SetStateAction<number>, options?: ScrollToIndexOptions) => {
      index = typeof index === 'function' ? index(currentIndexRef.current) : index;
      // We don't use TanStack Virtual's `scrollToIndex()` here since it won't scroll to the position for an item that 
      // isn't rendered yet + it seems to be a bit buggy around smooth scrolling since it scrolls then immediately
      // checks to see if it's finished scrolling and will try again if not (causing jumpiness).
      const container = rowVirtualizer.scrollElement
      if (!container) return;
      const itemHeight = rowVirtualizer.getVirtualItems()[0]?.size || 0;
      const newScrollTop = index * itemHeight
      temporarilyDisableScrollSnapping();
      debugMode && console.log(`Scrolling to index ${index} at height ${newScrollTop}`);
      rowVirtualizer.scrollElement?.scrollTo({ top: newScrollTop, behavior: "smooth", ...options });
    },
    [rowVirtualizer]
  );
  
  useEffect(() => {
    debugMode && console.log("currentIndex changed to", currentIndex);
    if (currentIndex >= mediaItems.length - 5) {
      loadMoreMediaItems();
    }
  }, [currentIndex, mediaItems.length]); 

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const nextKey = isForceLandscape ? "ArrowRight" : "ArrowDown";
      const previousKey = isForceLandscape ? "ArrowLeft" : "ArrowUp";
      debugMode && (e.key === previousKey || e.key === nextKey) && 
        console.log("VideoScroller Keydown", e.key, {nextKey, previousKey});
      if (e.key === previousKey) {
        // Go to the previous item
        const newIndex = (prevIndex: number) => prevIndex - 1
        scrollToIndex(newIndex, { behavior: "instant" });
        setCurrentIndex(newIndex);
        e.preventDefault();
      } else if (e.key === nextKey) {
        // Go to the next item
        const newIndex = (prevIndex: number) => prevIndex + 1
        scrollToIndex(newIndex, { behavior: "instant" });
        setCurrentIndex(newIndex);
        e.preventDefault();
      }
    }
    // We use capture so we can stop it propagating to the video player which treats arrow keys as seek commands
    window.addEventListener("keydown", handleKeyDown, {capture: true});
    return () => {
      window.removeEventListener("keydown", handleKeyDown, {capture: true});
    };
  }, [isForceLandscape, setCurrentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "c") {
        setAppSetting("crtEffect", (prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  
  // Store scroll position when window is resized
  useEffect(() => {
    const restoreScrollPosition = () => {
      if (rowVirtualizer) {
        const oldSize = rowVirtualizer.getVirtualItems()[0].size
        rowVirtualizer.measure();
        const newSize = rowVirtualizer.getVirtualItems()[0].size
        if (oldSize === newSize) return;
        
        scrollToIndex(currentIndex => currentIndex, { behavior: "instant" });
      }
    };
    
    window.addEventListener('resize', restoreScrollPosition);
    return () => {
      window.removeEventListener('resize', restoreScrollPosition);
    };
  }, [scrollToIndex, rowVirtualizer]);
  
  useEffect(() => {
    // Restore scroll position after items have been resized for landscape/portrait mode
    scrollToIndex(currentIndex => currentIndex, { behavior: "instant" });
  }, [isForceLandscape]);  

  const observerRef = useRef<IntersectionObserver | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const observedElementsRef = useRef<Map<Element, number>>(new Map());
  
  // Update the currentIndex when scrolling
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the most visible entry
        let maxVisibility = 0;
        let mostVisibleIndex = currentIndexRef.current;
        
        entries.forEach((entry) => {
          const index = observedElementsRef.current.get(entry.target);
          if (index === undefined) return;
          
          // Calculate how visible the element is (ratio of intersection)
          const visibilityRatio = entry.intersectionRatio;
          
          if (visibilityRatio > maxVisibility) {
            maxVisibility = visibilityRatio;
            mostVisibleIndex = index;
          }
        });
        
        if (mostVisibleIndex === currentIndexRef.current) return;
        
        // Only update if we found a valid entry with enough visibility
        if (maxVisibility > 0.3) {
          setCurrentIndex(mostVisibleIndex);
        }
      },
      { 
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: "0px"
      }
    );
    
    // Set up a function to refresh which elements are being observed
    const updateObservedElements = () => {
      const observer = observerRef.current;
      if (!observer) return;
      
      // Clear previous observations
      observedElementsRef.current.forEach((_, element) => {
        observer.unobserve(element);
      });
      observedElementsRef.current.clear();
      
      // Find all rendered items and observe them
      document.querySelectorAll('[data-index]').forEach((element) => {
        const indexAttr = element.getAttribute('data-index');
        if (indexAttr !== null) {
          const index = parseInt(indexAttr, 10);
          if (!isNaN(index)) {
            observedElementsRef.current.set(element, index);
            observer.observe(element);
          }
        }
      });
    };

    // Initial setup of observed elements
    setTimeout(updateObservedElements, 100); // Short delay to ensure DOM elements are rendered
    
    // Set up a mutation observer to detect when the DOM changes
    mutationObserverRef.current = new MutationObserver(updateObservedElements);
    
    // Start observing the container for DOM changes
    const container = document.querySelector('.VideoScroller');
    if (container) {
      mutationObserverRef.current.observe(container, {
        childList: true,
        subtree: false,
        attributes: false,
      });
    }

    const observer = observerRef.current;
    return () => {
      if (observer) {
        observer.disconnect();
      }
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
      }
    };
  }, [setCurrentIndex]);
  
  
  // Freeze the list of items to render while changing orientation and switching virtualizers
  // to avoid unmounting and remounting all items which would loose video playback state.
  // This is a fairly ugly solution for that but it works.
  const [itemsToRenderFrozen, setItemsToRenderFrozen] = useState(false);
  const itemsToRenderFrozenRef = useRef(false);
  const previousIsForceLandscapeRef = useRef<boolean | undefined>(undefined);
  if (previousIsForceLandscapeRef.current !== isForceLandscape) {
    const previousIsForceLandscape = previousIsForceLandscapeRef.current;
    previousIsForceLandscapeRef.current = isForceLandscape;
    if (previousIsForceLandscape !== undefined) {
      setItemsToRenderFrozen(true);
      itemsToRenderFrozenRef.current = true;
      setTimeout(() => {
        setItemsToRenderFrozen(false);
        itemsToRenderFrozenRef.current = false;
      }, 100);
    };
  }
  const previousItemIndexesToRenderRef = useRef<number[]>([]);
  const itemIndexesToRender = useMemo(() => {
    if (itemsToRenderFrozenRef.current && previousItemIndexesToRenderRef.current) {
      return previousItemIndexesToRenderRef.current;
    }
    const newItemIndexesToRender = rowVirtualizer.getVirtualItems().map(v => v.index);
    previousItemIndexesToRenderRef.current = newItemIndexesToRender;
    return newItemIndexesToRender;
  }, [rowVirtualizer.getVirtualItems(), itemsToRenderFrozen]);
  

  /* -------------------------------- Component ------------------------------- */

  // ? Added tabIndex to container to satisfy accessible scroll region.
  return (
    <div
      className={cx("VideoScroller", {scrollSnappingEnabled: scrollSnappingEnabled() })}
      data-testid="VideoScroller--container"
      tabIndex={0}
      ref={rootElmRef}
      style={{ height: rowVirtualizer.getTotalSize() }}
    >
      {debugMode && <div className="debugStats">
        {rowVirtualizer.isScrolling ? "Scrolling" : "Not Scrolling"}
        {" "}({mediaItems.length} media loaded)
        {onlyShowMatchingOrientation && ` limiting to ${orientation} orientation`}
      </div>}
      {mediaItems.map((mediaItem, i) => {
        const style = {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 'calc(var(--y-unit-large) * 100)',
          transform: `translateY(calc(var(--y-unit-large) * 100 * ${i}))`,
          ...(debugMode ? {
            "backgroundColor": `hsl(${i * 37  % 360}, 70%, 50%)`,
            border: `10px ${i === currentIndex ? 'black' : 'transparent'} dashed`,
          } : {})
        } as const
        if (
          itemIndexesToRender.includes(i)
        ) {
          return (
            <VideoItem
              changeItemHandler={(newIndex, scrollOptions) => {
                scrollToIndex(newIndex, scrollOptions);
                setCurrentIndex(newIndex);
              }}
              currentIndex={currentIndex}
              index={i}
              key={mediaItem.id}
              mediaItem={mediaItem}
              style={style}
              currentlyScrolling={rowVirtualizer.isScrolling}
            />
          );
        } else return <div key={mediaItem.id} className="dummy-video-item" style={style} />;
      })}
    </div>
  );
};

export default VideoScroller;
