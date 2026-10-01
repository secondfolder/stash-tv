import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import React from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
// RTL cleanup runs centrally in test/setup.ts
import type { VideoJsPlayer } from "video.js"
import { PictureInPictureActionButton } from "../../../src/components/action-buttons/buttons/PictureInPictureActionButton"
import { useFollowPictureInPicture } from "../../../src/hooks/usePictureInPicture"
import { resetStores } from "../helpers/stores"

/**
 * The picture-in-picture button puts the current slide's video into PiP, and PiP
 * then follows whichever slide is current, with next/previous Media Session
 * handlers while in PiP. jsdom has no PiP support so the document API and the
 * Video.js player are stubbed.
 *
 * @see docs/video-player.md § "Picture-in-picture"
 */

let pictureInPictureElement: Element | null
let exitPictureInPicture: ReturnType<typeof vi.fn>
let setActionHandler: ReturnType<typeof vi.fn>

function setPictureInPictureElement(element: Element | null) {
  const previous = pictureInPictureElement
  pictureInPictureElement = element
  act(() => {
    if (element) element.dispatchEvent(new Event("enterpictureinpicture", { bubbles: true }))
    else previous?.dispatchEvent(new Event("leavepictureinpicture", { bubbles: true }))
  })
}

/**
 * Like real browsers, requesting PiP rejects while the video has no metadata (readyState 0). Playing loads the
 * metadata unless `playLoadsMetadata` is false.
 */
function createPlayer(
  { requestResult = "resolve", readyState = 1, playLoadsMetadata = true }:
    { requestResult?: "resolve" | "reject", readyState?: number, playLoadsMetadata?: boolean } = {}
) {
  const videoEl = document.body.appendChild(document.createElement("video"))
  const listeners = new Map<string, Set<() => void>>()
  const player = {
    readyState: vi.fn(() => readyState),
    paused: vi.fn(() => true),
    play: vi.fn(async () => {
      if (!playLoadsMetadata || readyState > 0) return
      readyState = 1
      player.trigger("loadedmetadata")
    }),
    one: vi.fn((event: string, listener: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener)
    }),
    off: vi.fn((event: string, listener: () => void) => listeners.get(event)?.delete(listener)),
    trigger: (event: string) => {
      const eventListeners = [...(listeners.get(event) ?? [])]
      listeners.delete(event)
      eventListeners.forEach((listener) => listener())
    },
    disablePictureInPicture: vi.fn(),
    isInPictureInPicture: vi.fn(() => pictureInPictureElement === videoEl),
    isDisposed: vi.fn(() => false),
    requestPictureInPicture: vi.fn(() => {
      if (readyState === 0) return Promise.reject(new DOMException("Metadata not loaded", "InvalidStateError"))
      if (requestResult === "reject") return Promise.reject(new DOMException("No user gesture", "NotAllowedError"))
      setPictureInPictureElement(videoEl)
      return Promise.resolve({})
    }),
  }
  return { player, videoEl, playerRef: { current: player as unknown as VideoJsPlayer } }
}

beforeEach(() => {
  resetStores()
  pictureInPictureElement = null
  exitPictureInPicture = vi.fn(async () => setPictureInPictureElement(null))
  setActionHandler = vi.fn()
  Object.defineProperty(document, "pictureInPictureEnabled", { configurable: true, get: () => true })
  Object.defineProperty(document, "pictureInPictureElement", { configurable: true, get: () => pictureInPictureElement })
  Object.defineProperty(document, "exitPictureInPicture", { configurable: true, value: exitPictureInPicture })
  Object.defineProperty(navigator, "mediaSession", { configurable: true, value: { setActionHandler } })
})

afterEach(() => {
  for (const prop of ["pictureInPictureEnabled", "pictureInPictureElement", "exitPictureInPicture"]) {
    delete (document as unknown as Record<string, unknown>)[prop]
  }
  delete (navigator as unknown as Record<string, unknown>).mediaSession
  // Only remove the videos tests created; RTL's cleanup unmounts rendered components (and their popover portals) later
  document.querySelectorAll("body > video").forEach((video) => video.remove())
})

describe("PictureInPictureActionButton", () => {
  it("renders nothing when picture-in-picture isn't supported", () => {
    Object.defineProperty(document, "pictureInPictureEnabled", { configurable: true, get: () => false })
    const { playerRef } = createPlayer()
    const { container } = render(<PictureInPictureActionButton playerRef={playerRef} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("re-enables PiP on the player then requests it, and restores the setting on leave", async () => {
    const { player, playerRef } = createPlayer()
    render(<PictureInPictureActionButton playerRef={playerRef} />)

    await userEvent.click(screen.getByRole("button", { name: "Open picture-in-picture" }))

    expect(player.disablePictureInPicture).toHaveBeenCalledWith(false)
    expect(player.requestPictureInPicture).toHaveBeenCalled()
    expect(player.disablePictureInPicture.mock.invocationCallOrder[0])
      .toBeLessThan(player.requestPictureInPicture.mock.invocationCallOrder[0])

    await vi.waitFor(() => expect(player.one).toHaveBeenCalledWith("leavepictureinpicture", expect.any(Function)))
    player.trigger("leavepictureinpicture")
    expect(player.disablePictureInPicture).toHaveBeenLastCalledWith(true)
  })

  it("plays a video that hasn't loaded yet, then retries", async () => {
    const { player, playerRef } = createPlayer({ readyState: 0 })
    render(<PictureInPictureActionButton playerRef={playerRef} />)

    await userEvent.click(screen.getByRole("button", { name: "Open picture-in-picture" }))

    expect(player.play).toHaveBeenCalled()
    await vi.waitFor(() => expect(player.requestPictureInPicture).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole("button", { name: "Close picture-in-picture" })).toBeInTheDocument()
    expect(screen.queryByText(/Play the video first/)).not.toBeInTheDocument()
  })

  it("restores disablePictureInPicture after a failed attempt", async () => {
    const { player, playerRef } = createPlayer({ requestResult: "reject" })
    vi.mocked(player.paused).mockReturnValue(false)
    render(<PictureInPictureActionButton playerRef={playerRef} />)

    await userEvent.click(screen.getByRole("button", { name: "Open picture-in-picture" }))

    await vi.waitFor(() => expect(player.disablePictureInPicture).toHaveBeenLastCalledWith(true))
  })

  it("opens the side panel asking the user to play the video if PiP still can't start", async () => {
    const { player, playerRef } = createPlayer({ readyState: 0, playLoadsMetadata: false })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<PictureInPictureActionButton playerRef={playerRef} />)

      await userEvent.click(screen.getByRole("button", { name: "Open picture-in-picture" }))
      expect(player.play).toHaveBeenCalled()
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

      expect(await screen.findByText(/Play the video first, then try again/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("reflects PiP state and exits when clicked while active", async () => {
    const { playerRef } = createPlayer()
    render(<PictureInPictureActionButton playerRef={playerRef} />)

    setPictureInPictureElement(document.body.appendChild(document.createElement("video")))
    await userEvent.click(screen.getByRole("button", { name: "Close picture-in-picture" }))

    expect(exitPictureInPicture).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Open picture-in-picture" })).toBeInTheDocument()
  })
})

describe("useFollowPictureInPicture", () => {
  function Harness(props: Parameters<typeof useFollowPictureInPicture>[0]) {
    useFollowPictureInPicture(props)
    return null
  }
  const goToItem = vi.fn()

  it("moves PiP to a slide when it becomes current while another video is in PiP", () => {
    const { player, playerRef } = createPlayer()
    const { rerender } = render(<Harness playerRef={playerRef} isCurrentVideo={false} playerReady goToItem={goToItem} />)
    setPictureInPictureElement(document.body.appendChild(document.createElement("video")))
    expect(player.requestPictureInPicture).not.toHaveBeenCalled()

    rerender(<Harness playerRef={playerRef} isCurrentVideo playerReady goToItem={goToItem} />)

    expect(player.requestPictureInPicture).toHaveBeenCalled()
  })

  it("waits for the new video's metadata before moving PiP to it", () => {
    const { player, playerRef } = createPlayer({ readyState: 0 })
    setPictureInPictureElement(document.body.appendChild(document.createElement("video")))

    render(<Harness playerRef={playerRef} isCurrentVideo playerReady goToItem={goToItem} />)

    expect(player.requestPictureInPicture).not.toHaveBeenCalled()
    expect(player.one).toHaveBeenCalledWith("loadedmetadata", expect.any(Function))
    vi.mocked(player.readyState).mockReturnValue(1)
    act(() => player.trigger("loadedmetadata"))
    expect(player.requestPictureInPicture).toHaveBeenCalled()
  })

  it("stops waiting for metadata once the slide is no longer current", () => {
    const { player, playerRef } = createPlayer({ readyState: 0 })
    setPictureInPictureElement(document.body.appendChild(document.createElement("video")))
    const { rerender } = render(<Harness playerRef={playerRef} isCurrentVideo playerReady goToItem={goToItem} />)
    const [, onLoadedMetadata] = player.one.mock.calls[0]

    rerender(<Harness playerRef={playerRef} isCurrentVideo={false} playerReady goToItem={goToItem} />)

    expect(player.off).toHaveBeenCalledWith("loadedmetadata", onLoadedMetadata)
  })

  it("does nothing when no video is in PiP", () => {
    const { player, playerRef } = createPlayer()
    render(<Harness playerRef={playerRef} isCurrentVideo playerReady goToItem={goToItem} />)
    expect(player.requestPictureInPicture).not.toHaveBeenCalled()
  })

  it("closes PiP if the hand-off is refused", async () => {
    const { playerRef } = createPlayer({ requestResult: "reject" })
    setPictureInPictureElement(document.body.appendChild(document.createElement("video")))

    render(<Harness playerRef={playerRef} isCurrentVideo playerReady goToItem={goToItem} />)

    await vi.waitFor(() => expect(exitPictureInPicture).toHaveBeenCalled())
  })

  it("registers next/previous Media Session handlers only while current and in PiP", () => {
    const { playerRef } = createPlayer()
    const { rerender, unmount } = render(<Harness playerRef={playerRef} isCurrentVideo playerReady goToItem={goToItem} />)
    expect(setActionHandler).not.toHaveBeenCalled()

    setPictureInPictureElement(document.body.appendChild(document.createElement("video")))
    const handlers = Object.fromEntries(setActionHandler.mock.calls)
    handlers.nexttrack()
    expect(goToItem).toHaveBeenLastCalledWith("next")
    handlers.previoustrack()
    expect(goToItem).toHaveBeenLastCalledWith("previous")

    rerender(<Harness playerRef={playerRef} isCurrentVideo={false} playerReady goToItem={goToItem} />)
    expect(setActionHandler).toHaveBeenCalledWith("nexttrack", null)
    expect(setActionHandler).toHaveBeenCalledWith("previoustrack", null)
    unmount()
  })
})
