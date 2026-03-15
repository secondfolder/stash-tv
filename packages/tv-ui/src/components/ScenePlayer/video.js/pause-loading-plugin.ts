import { getLogger } from "@logtape/logtape";
import videojs, { VideoJsPlayer } from "video.js";
import testVideo from '../../../assets/1x1_10bit.mp4?url';

let supports10BitVideos: Promise<boolean> | undefined = undefined

const logger = getLogger(["stash-tv", "pause-loading-plugin"])

declare module "video.js" {
  interface VideoJsPlayer {
    cancelLoading: () => void;
    enableLoading: () => void;
    loadingCanceled: () => boolean
  }
}

class PauseLoadingPlugin extends videojs.getPlugin("plugin") {
  constructor(player: VideoJsPlayer) {
    super(player);

    let unloadedSource: string | null = null;
    let unloadedPoster: string | null = null;
    let pausedStateOnUnload = player.paused()
    let _loadingCanceled = false
    player.loadingCanceled = () => _loadingCanceled

    async function getVideoFrameBlob(video: HTMLVideoElement) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Failed to get canvas")
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });
    }

    async function setPosterToCurrentFrame() {
      if (player.isDisposed()) return
      const videoElm = player.tech(true).el()
      if (!(videoElm instanceof HTMLVideoElement)) {
        logger.error(`Unexpected element {*}`, {videoElm})
        return
      }
      if(videoElm.readyState < 2) {
        return
      }
      const posterElement = player.getChild("posterImage")?.el()

      const frame = await getVideoFrameBlob(videoElm)
      if (frame) {
        const frameUrl = URL.createObjectURL(frame)
        if (posterElement && posterElement instanceof HTMLElement) {
          posterElement.style.opacity = "0"
          posterElement.style.display = "block"
        }
        player.poster(frameUrl)
        // Wait a little bit to ensure poster has been rendered
        await new Promise(resolve => setTimeout(resolve, 200))
        const fadeToPosterTime = 0.5 // in seconds
        if (posterElement && posterElement instanceof HTMLElement) {
          posterElement.style.opacity = "1"
          posterElement.style.transition = `opacity ${fadeToPosterTime}s`
        }
        player.one("playing", () => {
          if (posterElement && posterElement instanceof HTMLElement) {
            posterElement.style.opacity = ""
            posterElement.style.display = ""
            posterElement.style.transition = ""

            setTimeout(() => {
              if (typeof unloadedPoster === "string") {
                player.poster(unloadedPoster)
                unloadedPoster = null
              }
            }, 500)
          }
        })
        // Wait till opacity transition is complete
        await new Promise(resolve => setTimeout(resolve, fadeToPosterTime * 1000))
      } else {
        logger.warn(`Failed to set video frame as poster`)
      }
    }

    player.cancelLoading = function() {
      _loadingCanceled = true
      const videoElm = player.tech(true).el()
      if (!(videoElm instanceof HTMLVideoElement)) {
        logger.error(`Unexpected element {*}`, {videoElm})
        return
      }
      unloadedSource = videoElm.src;
      unloadedPoster = player.poster();

      async function unloadAfterPaused() {
        if (player.isDisposed()) return
        if (await supports10BitVideos === undefined) {
          supports10BitVideos = testFor10BitSupport()
        }
        const showLastFrame = await supports10BitVideos
        if (showLastFrame) {
          await setPosterToCurrentFrame()
        }
        if (player.isDisposed()) return
        const currentTime = videoElm.currentTime
        videoElm.src = ""; // clear sources to cancel requests
        videoElm.load()
        videoElm.currentTime = currentTime

        player.trigger("loadingCanceled", {currentTime})
        logger.debug('Loading canceled.');
      }

      pausedStateOnUnload = player.paused()
      if (!player.paused()) {
        videoElm.addEventListener('pause', unloadAfterPaused, {once: true})
        player.pause()
      } else {
        unloadAfterPaused()
      }
    };

    player.enableLoading = function() {
      if (!unloadedSource) {
        throw Error("unloadedSource not set")
      }
      const videoElm = player.tech(true).el()
      if (!(videoElm instanceof HTMLVideoElement)) {
        logger.error(`Unexpected element {*}`, {videoElm})
        return
      }
      _loadingCanceled = false
      if (player.isDisposed()) return
      const currentTime = videoElm.currentTime
      videoElm.src = unloadedSource
      videoElm.load()

      // Using `player.currentTime(currentTime)` will delay setting the currentTime on the tech elm until the
      // player is marked as ready. But we want it set before then so that it loads the right section. That's
      // why we update the tech elm directly.
      videoElm.currentTime = currentTime
      unloadedSource = null

      if (!pausedStateOnUnload) {
        player.play()
      }

      unloadedSource = null;
      logger.debug('Video loading resumed, sources restored.');
    }
  };
};

videojs.registerPlugin('pauseLoading', PauseLoadingPlugin);

function pauseLoadingMiddleware(player: VideoJsPlayer) {
  let currentTimeWhenLoadingCanceled: number | undefined = undefined

  player.on("loadingCanceled", (event, data) => {
    currentTimeWhenLoadingCanceled = data.currentTime
  })

  function enableLoadingIfCanceled() {
    if (currentTimeWhenLoadingCanceled !== undefined) {
      currentTimeWhenLoadingCanceled = undefined
      player.enableLoading()
    }
  }

  return {
    setSource: function(srcObj: unknown, next: Function) {
      // pass null as the first argument to indicate that the source is not rejected
      next(null, srcObj);
    },
    callPlay: function() {
      enableLoadingIfCanceled()
    },
    setCurrentTime: function(time: number) {
      enableLoadingIfCanceled()
      return time;
    },
  }
}

videojs.use("*", pauseLoadingMiddleware);

videojs.hooks('beforeerror', ((player: VideoJsPlayer, error: unknown) => {
  // Replacing the source with an empty string to force the browser to stop loading results in an error being
  // thrown since an empty string is not a valid source. Such an error isn't helpful and might make the user
  // think something is wrong so we suppress it.
  if (
    player.loadingCanceled?.()
    && typeof error === "object"
    && error !== null
    && 'code' in error
    && error.code === 4
  ) {
    return null
  }
  return error
  // Videojs's hook arguments aren't typed so we need to cast
}) as () => {});

function testFor10BitSupport() {
  // Firefox has a bug for drawImage() with 10-bit videos https://bugzilla.mozilla.org/show_bug.cgi?id=2021540
  return new Promise<boolean>((resolve, reject) => {

    const video = document.createElement('video');
    video.src = testVideo
    video.load()
    video.requestVideoFrameCallback(() => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Failed to get canvas")
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const centerX = Math.floor(canvas.width / 2);
      const centerY = Math.floor(canvas.height / 2);

      const pixelData = ctx.getImageData(centerX, centerY, 1, 1).data;
      const [r, g, b, a] = pixelData;
      resolve(r > 200 && g < 50 && b < 50)
    })
  })
}
