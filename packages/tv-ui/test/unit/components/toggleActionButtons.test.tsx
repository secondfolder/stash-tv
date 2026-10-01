import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
// RTL cleanup runs centrally in test/setup.ts
import { UiVisibilityActionButton } from "../../../src/components/action-buttons/buttons/UiVisibilityActionButton"
import { SettingsActionButton } from "../../../src/components/action-buttons/buttons/SettingsActionButton"
import { ForceLandscapeActionButton } from "../../../src/components/action-buttons/buttons/ForceLandscapeActionButton"
import { LetterboxingActionButton } from "../../../src/components/action-buttons/buttons/LetterboxingActionButton"
import { LoopActionButton } from "../../../src/components/action-buttons/buttons/LoopActionButton"
import { FullscreenActionButton } from "../../../src/components/action-buttons/buttons/FullscreenActionButton"
import { ShowSceneInfoActionButton } from "../../../src/components/action-buttons/buttons/ShowSceneInfoActionButton"
import { useTvConfig } from "../../../src/store/tvConfig"
import { useGlobalState } from "../../../src/store/globalState"
import { resetStores } from "../helpers/stores"

/**
 * Buttons that switch a single on/off setting. Each click flips the setting, and
 * the button's accessible title says what the next click will do (or, for
 * force-landscape, which orientation is current).
 *
 * @see docs/action-buttons.md § "Anatomy of a Button"
 */

beforeEach(() => {
  resetStores()
})

const tvConfigToggles = [
  { name: "UiVisibilityActionButton", Button: UiVisibilityActionButton, setting: "uiVisible", titles: { on: "Hide UI", off: "Show UI" } },
  { name: "ForceLandscapeActionButton", Button: ForceLandscapeActionButton, setting: "forceLandscape", titles: { on: "Landscape", off: "Portrait" } },
  { name: "LetterboxingActionButton", Button: LetterboxingActionButton, setting: "letterboxing", titles: { on: "Fit to screen", off: "Fill screen" } },
  { name: "LoopActionButton", Button: LoopActionButton, setting: "looping", titles: { on: "Stop looping scene", off: "Loop scene" } },
] as const

describe.each(tvConfigToggles)("$name", ({ Button, setting, titles }) => {
  it(`turns ${setting} on when it's off`, async () => {
    useTvConfig.getState().set(setting, false)
    render(<Button />)

    await userEvent.click(screen.getByRole("button", { name: titles.off }))

    expect(useTvConfig.getState()[setting]).toBe(true)
    expect(screen.getByRole("button", { name: titles.on })).toBeInTheDocument()
  })

  it(`turns ${setting} off when it's on`, async () => {
    useTvConfig.getState().set(setting, true)
    render(<Button />)

    await userEvent.click(screen.getByRole("button", { name: titles.on }))

    expect(useTvConfig.getState()[setting]).toBe(false)
    expect(screen.getByRole("button", { name: titles.off })).toBeInTheDocument()
  })
})

describe("SettingsActionButton", () => {
  it("opens the settings when they're closed", async () => {
    render(<SettingsActionButton />)

    await userEvent.click(screen.getByRole("button", { name: "Show Settings" }))

    expect(useGlobalState.getState().showSettings).toBe(true)
    expect(screen.getByRole("button", { name: "Hide Settings" })).toBeInTheDocument()
  })

  it("closes the settings when they're open", async () => {
    useGlobalState.getState().set("showSettings", true)
    render(<SettingsActionButton />)

    await userEvent.click(screen.getByRole("button", { name: "Hide Settings" }))

    expect(useGlobalState.getState().showSettings).toBe(false)
  })
})

describe("FullscreenActionButton", () => {
  // jsdom has no Fullscreen API, so provide the one method the button checks for
  beforeEach(() => {
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: vi.fn() })
  })
  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).exitFullscreen
  })

  it("enters fullscreen when not fullscreen", async () => {
    render(<FullscreenActionButton />)

    await userEvent.click(screen.getByRole("button", { name: "Open fullscreen" }))

    expect(useGlobalState.getState().fullscreen).toBe(true)
    expect(screen.getByRole("button", { name: "Close fullscreen" })).toBeInTheDocument()
  })

  it("leaves fullscreen when fullscreen", async () => {
    useGlobalState.getState().set("fullscreen", true)
    render(<FullscreenActionButton />)

    await userEvent.click(screen.getByRole("button", { name: "Close fullscreen" }))

    expect(useGlobalState.getState().fullscreen).toBe(false)
  })

  it("renders nothing when the browser has no Fullscreen API", () => {
    delete (document as unknown as Record<string, unknown>).exitFullscreen
    const { container } = render(<FullscreenActionButton />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe("ShowSceneInfoActionButton", () => {
  it("opens the scene info when it's closed", async () => {
    const setSceneInfoOpen = vi.fn()
    render(<ShowSceneInfoActionButton sceneInfoOpen={false} setSceneInfoOpen={setSceneInfoOpen} />)

    await userEvent.click(screen.getByRole("button", { name: "Show scene info" }))

    expect(setSceneInfoOpen).toHaveBeenCalledWith(true)
  })

  it("closes the scene info when it's open", async () => {
    const setSceneInfoOpen = vi.fn()
    render(<ShowSceneInfoActionButton sceneInfoOpen={true} setSceneInfoOpen={setSceneInfoOpen} />)

    await userEvent.click(screen.getByRole("button", { name: "Close scene info" }))

    expect(setSceneInfoOpen).toHaveBeenCalledWith(false)
  })
})
