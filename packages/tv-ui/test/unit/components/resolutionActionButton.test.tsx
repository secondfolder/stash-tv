import { describe, it, expect, beforeEach, vi } from "vitest"
import React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
// RTL cleanup runs centrally in test/setup.ts
import type { VideoJsPlayer } from "video.js"
import { ResolutionActionButton } from "../../../src/components/action-buttons/buttons/ResolutionActionButton"
import { useTvConfig } from "../../../src/store/tvConfig"
import { resetStores } from "../helpers/stores"
import { sidePanel } from "../../helpers/actionButtons"

/**
 * Choosing the already-preferred stream on a slide whose player is playing a different one. Changing the preference
 * would do nothing (it's already set), so the button switches the player itself. The rest of the resolution button is
 * covered against the real player in `test/integration/player-action-buttons.test.tsx`; this case is here because
 * the real player only gets into this state in ways jsdom can't reproduce (e.g. a slide loaded before the
 * preference changed, or Stash's fallback after a stream fails to play).
 *
 * @see docs/video-player.md § "Source Selection"
 */

/**
 * A stand-in for the player with Stash's source selector menu, playing `playing` out of the given stream labels.
 * Clicking a menu item (which is how the app switches streams) records the switch.
 */
function createPlayer(labels: string[], playing: string) {
  const switchedTo: string[] = []
  const items = labels.map((label) => {
    const el = document.createElement("li")
    el.addEventListener("click", () => switchedTo.push(label))
    return { source: { label, src: `https://stash.test/scene/1/${label}` }, el: () => el }
  })
  const menu = { items, selectedSource: null, focus: vi.fn() }
  const player = {
    mediaItem: {
      entityType: "scene",
      entity: { files: [{ height: 720, width: 1280, path: "/media/scene.mp4" }] },
    },
    sourceSelector: () => ({ menu }),
    currentSource: () => items.find((item) => item.source.label === playing)?.source,
    on: vi.fn(),
    off: vi.fn(),
  }
  // Only the parts of the player the button uses are stubbed
  return { switchedTo, playerRef: { current: player as unknown as VideoJsPlayer } }
}

beforeEach(() => {
  resetStores()
})

describe("ResolutionActionButton", () => {
  it("switches the player to the preferred stream when it's playing another", async () => {
    useTvConfig.getState().set("preferredStreamLabel", "HLS")
    const { switchedTo, playerRef } = createPlayer(["Direct stream", "HLS"], "Direct stream")
    render(<ResolutionActionButton playerRef={playerRef} />)
    await userEvent.click(screen.getByRole("button", { name: "Set stream resolution" }))

    await userEvent.click(within(sidePanel()).getByRole("button", { name: "HLS" }))

    expect(switchedTo).toEqual(["HLS"])
    expect(useTvConfig.getState().preferredStreamLabel).toBe("HLS")
  })
})
