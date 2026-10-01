import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import React from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
// RTL cleanup runs centrally in test/setup.ts
import { VolumeActionButton, buttonDefinition } from "../../../src/components/action-buttons/buttons/VolumeActionButton"
import { useTvConfig } from "../../../src/store/tvConfig"
import { resetStores } from "../helpers/stores"
import { actionButtonRoot, displayedIconState } from "../../helpers/actionButtons"

/**
 * The volume button mutes/unmutes by default. With its "Full volume control" option
 * it opens a side panel with a volume slider instead, except on iOS, where a
 * video's volume can't be set programmatically so it stays a mute toggle.
 *
 * @see docs/action-buttons.md § "Button Props & Runtime Config Validation"
 */

const muteToggleConfig = { id: "volume", type: "button", pinned: false, buttonType: "volume" }
const fullControlConfig = { ...muteToggleConfig, fullControl: true }

const iPhoneUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

beforeEach(() => {
  resetStores()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function volumeButton() {
  return screen.getByRole("button", { name: "Volume" })
}

describe("VolumeActionButton as a mute toggle", () => {
  it("unmutes to full volume when muted", async () => {
    useTvConfig.getState().set("volume", 0)
    render(<VolumeActionButton config={muteToggleConfig} />)

    await userEvent.click(volumeButton())

    expect(useTvConfig.getState().volume).toBe(1)
  })

  it("mutes when not muted", async () => {
    useTvConfig.getState().set("volume", 0.4)
    render(<VolumeActionButton config={muteToggleConfig} />)

    await userEvent.click(volumeButton())

    expect(useTvConfig.getState().volume).toBe(0)
  })

  it("shows the muted icon only while muted", async () => {
    useTvConfig.getState().set("volume", 0)
    render(<VolumeActionButton config={muteToggleConfig} />)
    const displayedState = () => displayedIconState(actionButtonRoot(volumeButton()), buttonDefinition.icon)
    expect(await displayedState()).toBe("inactive")

    await userEvent.click(volumeButton())

    expect(await displayedState()).toBe("active")
  })

  it("opens no volume slider", async () => {
    render(<VolumeActionButton config={muteToggleConfig} />)

    await userEvent.click(volumeButton())

    expect(screen.queryByRole("slider")).not.toBeInTheDocument()
  })

  it("falls back to a mute toggle when its config is invalid", async () => {
    useTvConfig.getState().set("volume", 0)
    render(<VolumeActionButton config={{ ...fullControlConfig, fullControl: "yes please" }} />)

    await userEvent.click(volumeButton())

    expect(useTvConfig.getState().volume).toBe(1)
    expect(screen.queryByRole("slider")).not.toBeInTheDocument()
  })
})

describe("VolumeActionButton with full volume control", () => {
  it("opens a slider showing the current volume instead of muting", async () => {
    useTvConfig.getState().set("volume", 0.4)
    render(<VolumeActionButton config={fullControlConfig} />)

    await userEvent.click(volumeButton())

    expect(await screen.findByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuenow", "40")
    expect(useTvConfig.getState().volume).toBe(0.4)
  })

  it("sets the volume from the slider", async () => {
    useTvConfig.getState().set("volume", 0.4)
    render(<VolumeActionButton config={fullControlConfig} />)
    await userEvent.click(volumeButton())
    const slider = await screen.findByRole("slider", { name: "Volume" })

    act(() => slider.focus())
    await userEvent.keyboard("{End}")

    expect(useTvConfig.getState().volume).toBe(1)
  })

  it("stays a mute toggle on iOS, where volume can't be set", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(iPhoneUserAgent)
    useTvConfig.getState().set("volume", 0)
    render(<VolumeActionButton config={fullControlConfig} />)

    await userEvent.click(volumeButton())

    expect(useTvConfig.getState().volume).toBe(1)
    expect(screen.queryByRole("slider")).not.toBeInTheDocument()
  })
})
