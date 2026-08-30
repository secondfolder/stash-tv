import { describe, it, expect, afterEach, cleanup, vi } from "vitest"
import React from "react"
import { cleanup as cleanupRtl } from "@testing-library/react"
import { render, screen } from "@testing-library/react"
import Switch from "../../../src/components/settings/Switch"

describe("Switch", () => {
  afterEach(() => {
    cleanupRtl()
  })

  it("renders as a Form.Switch component", () => {
    render(<Switch label="Test Switch" />)
    const switchElement = screen.getByRole("checkbox")
    expect(switchElement).toBeInTheDocument()
  })

  it("renders label text", () => {
    render(<Switch label="Enable Feature" />)
    expect(screen.getByText("Enable Feature")).toBeInTheDocument()
  })

  it("applies Switch className", () => {
    const { container } = render(<Switch label="Test" />)
    const switchWrapper = container.querySelector(".Switch")
    expect(switchWrapper).toBeInTheDocument()
  })

  it("applies custom className", () => {
    const { container } = render(<Switch label="Test" className="custom-class" />)
    const switchWrapper = container.querySelector(".Switch")
    expect(switchWrapper).toHaveClass("custom-class")
  })

  it("passes through checked prop", () => {
    const { container } = render(<Switch label="Test" checked={true} />)
    const switchElement = container.querySelector('input[type="checkbox"]')
    expect(switchElement).toBeChecked()
  })

  it("passes through disabled prop", () => {
    const { container } = render(<Switch label="Test" disabled={true} />)
    const switchElement = container.querySelector('input[type="checkbox"]')
    expect(switchElement).toBeDisabled()
  })

  it("passes through onChange prop", () => {
    const handleChange = vi.fn()
    const { container } = render(<Switch label="Test" onChange={handleChange} />)
    const switchElement = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    switchElement.click()
    expect(handleChange).toHaveBeenCalled()
  })

  it("passes through id prop", () => {
    const { container } = render(<Switch label="Test" id="test-switch" />)
    const switchElement = container.querySelector("#test-switch")
    expect(switchElement).toBeInTheDocument()
  })

  it("renders label as span", () => {
    const { container } = render(<Switch label="Test Label" />)
    const labelSpan = container.querySelector(".Switch span")
    expect(labelSpan).toBeInTheDocument()
    expect(labelSpan).toHaveTextContent("Test Label")
  })
})
