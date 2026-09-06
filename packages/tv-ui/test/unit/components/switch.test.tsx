import { describe, it, expect } from "vitest"
import React from "react"
// RTL cleanup runs centrally in test/setup.ts
import { render, screen } from "@testing-library/react"
import Switch from "../../../src/components/settings/Switch"

/**
 * Tests the Switch wrapper's own behaviour: the label is wrapped in a span
 * (so it can be styled) and custom classes merge with the base class.
 * React Bootstrap's switch behaviour is not re-tested.
 */

describe("Switch", () => {
  it("renders its label text", () => {
    render(<Switch id="test-switch" label="CRT Effect" />)

    expect(screen.getByLabelText("CRT Effect")).toBeInTheDocument()
  })

  it("merges custom classes onto the base Switch class", () => {
    render(<Switch id="test-switch" label="CRT Effect" className="custom-class" />)

    const input = screen.getByRole("checkbox")
    expect(input.closest("div")).toHaveClass("Switch", "custom-class")
  })
})
