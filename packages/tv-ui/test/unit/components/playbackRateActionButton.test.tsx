import { describe, it, expect, beforeEach, vi } from "vitest"
import React from "react"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
// RTL cleanup runs centrally in test/setup.ts
import type { VideoJsPlayer } from "video.js"
import {
  PlaybackRateActionButton,
  buttonDefinition,
} from "../../../src/components/action-buttons/buttons/PlaybackRateActionButton"
import { useTvConfig } from "../../../src/store/tvConfig"
import { resetStores } from "../helpers/stores"
import { actionButtonRoot, displayedIconState, sidePanel } from "../../helpers/actionButtons"

/**
 * The playback rate button opens a side panel of speeds. Choosing one sets the
 * player's rate, and the button follows the player's rate (wherever it was changed
 * from), highlighting the current speed and showing as active when it isn't 1x.
 *
 * @see docs/action-buttons.md § "`ActionButtonBase`"
 */

/** A stand-in for the Video.js player: just the playback rate and its `ratechange` event. */
function createPlayer(initialRate = 1) {
  let rate = initialRate
  const listeners = new Set<() => void>()
  const player = {
    playbackRate: vi.fn((newRate?: number) => {
      if (newRate === undefined) return rate
      rate = newRate
      act(() => listeners.forEach((listener) => listener()))
      return undefined
    }),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "ratechange") listeners.add(listener)
    }),
  }
  return { player, playerRef: { current: player as unknown as VideoJsPlayer } }
}

const speeds = ["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x", "4x", "8x"]

beforeEach(() => {
  resetStores()
})

function rateButton() {
  return screen.getByRole("button", { name: "Set playback rate" })
}

async function openPanel() {
  await userEvent.click(rateButton())
  return sidePanel()
}

/** The panel's speed buttons with the current one marked. Its class is how the panel shows it. */
function highlightedSpeed(panel: HTMLElement) {
  return within(panel).getAllByRole("button").filter((button) => button.classList.contains("active")).map((button) => button.textContent)
}

describe("PlaybackRateActionButton", () => {
  it("offers every speed", async () => {
    const { playerRef } = createPlayer()
    render(<PlaybackRateActionButton playerRef={playerRef} />)

    const panel = await openPanel()

    expect(within(panel).getAllByRole("button").map((button) => button.textContent)).toEqual(speeds)
  })

  it("sets the player's rate to the chosen speed", async () => {
    const { player, playerRef } = createPlayer()
    render(<PlaybackRateActionButton playerRef={playerRef} />)
    const panel = await openPanel()

    await userEvent.click(within(panel).getByRole("button", { name: "2x" }))

    expect(player.playbackRate).toHaveBeenCalledWith(2)
    expect(highlightedSpeed(panel)).toEqual(["2x"])
  })

  it("highlights the speed the player was set to elsewhere", async () => {
    const { player, playerRef } = createPlayer()
    render(<PlaybackRateActionButton playerRef={playerRef} />)

    player.playbackRate(1.5)
    const panel = await openPanel()

    expect(highlightedSpeed(panel)).toEqual(["1.5x"])
  })

  it("starts on the configured playback rate", async () => {
    useTvConfig.getState().set("playbackRate", 0.75)
    const { playerRef } = createPlayer(0.75)
    render(<PlaybackRateActionButton playerRef={playerRef} />)

    const panel = await openPanel()

    expect(highlightedSpeed(panel)).toEqual(["0.75x"])
  })

  it("shows as active only while the rate isn't 1x", async () => {
    const { player, playerRef } = createPlayer()
    render(<PlaybackRateActionButton playerRef={playerRef} />)
    const displayedState = () => displayedIconState(actionButtonRoot(rateButton()), buttonDefinition.icon)
    expect(await displayedState()).toBe("inactive")

    player.playbackRate(2)
    expect(await displayedState()).toBe("active")

    player.playbackRate(1)
    expect(await displayedState()).toBe("inactive")
  })
})
