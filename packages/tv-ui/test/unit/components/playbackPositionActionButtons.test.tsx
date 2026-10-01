import { describe, it, expect, beforeEach } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
// RTL cleanup runs centrally in test/setup.ts
import { ActionButtonIcon, ActionButtonTitle } from "../../../src/components/action-buttons/ActionButtonBase"
import {
  StartPositionActionButton,
  buttonDefinition as startPositionButtonDefinition,
} from "../../../src/components/action-buttons/buttons/StartPositionActionButton"
import {
  EndPositionActionButton,
  buttonDefinition as endPositionButtonDefinition,
} from "../../../src/components/action-buttons/buttons/EndPositionActionButton"
import { useFeedback } from "../../../src/components/FeedbackOverlay"
import { useTvConfig } from "../../../src/store/tvConfig"
import { resetStores } from "../helpers/stores"

/**
 * The start/end point buttons step through the options of the Start Point / End
 * Point settings: each click selects the next option (wrapping around), names
 * the new option in the feedback overlay, the button's accessible title
 * reflects the current option, and the option is labelled beside the button
 * unless it's the plain beginning/end of the video.
 *
 * @see docs/action-buttons.md § "Cycle-Option Buttons"
 */

beforeEach(() => {
  resetStores()
  useFeedback.getState().setFeedback(null, { fade: false })
})

describe("StartPositionActionButton", () => {
  it("advances the start point to the next option on click", async () => {
    render(<StartPositionActionButton />)

    await userEvent.click(screen.getByRole("button", { name: "Resume from last played position" }))

    expect(useTvConfig.getState().startPosition).toBe("beginning")
    expect(screen.getByRole("button", { name: "Play from the beginning" })).toBeInTheDocument()
  })

  it("wraps from the last start point option back to the first", async () => {
    useTvConfig.getState().set("startPosition", "random")
    render(<StartPositionActionButton />)

    await userEvent.click(screen.getByRole("button", { name: "Start at a random marker (or position if none)" }))

    expect(useTvConfig.getState().startPosition).toBe("resume")
  })

  it("shows the newly selected start point as feedback", async () => {
    render(<StartPositionActionButton />)

    await userEvent.click(screen.getByRole("button"))

    expect(useFeedback.getState().contents).toBe("Play from the beginning")
  })

  it("labels the start point beside the button when it isn't the beginning", () => {
    render(<StartPositionActionButton />)

    expect(screen.getByText("Resume")).toBeInTheDocument()
  })

  it("shows no start point label when starting from the beginning", async () => {
    useTvConfig.getState().set("startPosition", "random")
    render(<StartPositionActionButton />)
    expect(screen.getByText("Random marker/time")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button")) // random -> resume
    await userEvent.click(screen.getByRole("button")) // resume -> beginning

    expect(useTvConfig.getState().startPosition).toBe("beginning")
    expect(screen.queryByText("Random marker/time")).not.toBeInTheDocument()
    expect(screen.queryByText("Resume")).not.toBeInTheDocument()
    expect(screen.queryByText("Beginning")).not.toBeInTheDocument()
  })
})

describe("EndPositionActionButton", () => {
  it("cycles through every end point option and back to the first", async () => {
    render(<EndPositionActionButton />)
    const button = screen.getByRole("button")

    const visited = []
    for (let i = 0; i < 3; i++) {
      await userEvent.click(button)
      visited.push(useTvConfig.getState().endPosition)
    }

    expect(visited).toEqual(["fixed-length", "random-length", "video-end"])
  })

  it("titles the button with the current end point", () => {
    useTvConfig.getState().set("endPosition", "random-length")
    render(<EndPositionActionButton />)

    expect(screen.getByRole("button", { name: "Play for random length of time" })).toBeInTheDocument()
  })

  it("shows the newly selected end point as feedback", async () => {
    render(<EndPositionActionButton />)

    await userEvent.click(screen.getByRole("button"))

    expect(useFeedback.getState().contents).toBe("Play for full length")
  })

  it("names the configured play length in the fixed length end point", async () => {
    useTvConfig.getState().set("playLength", 90)
    render(<EndPositionActionButton />)

    await userEvent.click(screen.getByRole("button"))

    expect(useFeedback.getState().contents).toBe("Play for 1 minute 30 seconds")
    expect(screen.getByRole("button", { name: "Play for 1 minute 30 seconds" })).toBeInTheDocument()
    expect(screen.getByText("After 1 minute 30 seconds")).toBeInTheDocument()
  })

  it("shows no end point label when playing to the end of the video", () => {
    render(<EndPositionActionButton />)

    expect(screen.queryByText("End")).not.toBeInTheDocument()
  })

  it("labels the end point beside the button when it isn't the end of the video", async () => {
    render(<EndPositionActionButton />)

    await userEvent.click(screen.getByRole("button"))

    expect(screen.getByText("After full length")).toBeInTheDocument()
  })
})

describe.each([
  { definition: startPositionButtonDefinition, genericTitle: "Change start point" },
  { definition: endPositionButtonDefinition, genericTitle: "Change end point" },
])("$definition.id button outside the stack", ({ definition, genericTitle }) => {
  // The settings list and folder previews render buttons in the "inactive"
  // state, which isn't one of the option values the buttons otherwise use.
  it("renders a generic title for the inactive state", () => {
    render(<ActionButtonTitle title={definition.title} state="inactive" />)

    expect(screen.getByText(genericTitle)).toBeInTheDocument()
  })

  it("renders an icon for the inactive state", () => {
    const { container } = render(<ActionButtonIcon iconDefinition={definition.icon} state="inactive" />)

    expect(container.querySelector("svg")).not.toBeNull()
  })
})
