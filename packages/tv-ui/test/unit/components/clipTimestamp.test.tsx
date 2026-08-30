import { describe, it, expect } from "vitest"
import React from "react"
import { render } from "@testing-library/react"
import ClipTimestamp from "../../../src/components/slide/ClipTimestamp"

describe("ClipTimestamp", () => {
  it("renders with start type", () => {
    const { container } = render(<ClipTimestamp type="start" progressPercentage={25} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toBeInTheDocument()
    expect(timestamp).toHaveClass("start-timestamp")
  })

  it("renders with end type", () => {
    const { container } = render(<ClipTimestamp type="end" progressPercentage={75} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toBeInTheDocument()
    expect(timestamp).toHaveClass("end-timestamp")
  })

  it("applies correct percentage position", () => {
    const { container } = render(<ClipTimestamp type="start" progressPercentage={50} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toHaveStyle({ left: "50%" })
  })

  it("applies 0% position", () => {
    const { container } = render(<ClipTimestamp type="start" progressPercentage={0} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toHaveStyle({ left: "0%" })
  })

  it("applies 100% position", () => {
    const { container } = render(<ClipTimestamp type="end" progressPercentage={100} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toHaveStyle({ left: "100%" })
  })

  it("has vjs-control class", () => {
    const { container } = render(<ClipTimestamp type="start" progressPercentage={25} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toHaveClass("vjs-control")
  })

  it("has both type-specific and vjs-control classes", () => {
    const { container } = render(<ClipTimestamp type="end" progressPercentage={75} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toHaveClass("vjs-control")
    expect(timestamp).toHaveClass("end-timestamp")
  })

  it("handles fractional percentages", () => {
    const { container } = render(<ClipTimestamp type="start" progressPercentage={33.333} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toHaveStyle({ left: "33.333%" })
  })

  it("handles small percentages", () => {
    const { container } = render(<ClipTimestamp type="start" progressPercentage={5} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toHaveStyle({ left: "5%" })
  })

  it("handles large percentages", () => {
    const { container } = render(<ClipTimestamp type="end" progressPercentage={95} />)
    const timestamp = container.querySelector(".ClipTimestamp")
    expect(timestamp).toHaveStyle({ left: "95%" })
  })
})
