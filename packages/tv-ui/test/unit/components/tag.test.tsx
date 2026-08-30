import { describe, it, expect, vi, afterEach, cleanup } from "vitest"
import { cleanup as cleanupRtl } from "@testing-library/react"
import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { Tag } from "../../../src/components/tags/tag"

// Import the type used by Tag
import type { SlimTag } from "../../../src/components/tags/EditTagSelectionForm"

const mockTag: SlimTag = {
  id: "tag1",
  name: "Test Tag",
  aliases: [],
  __typename: "TagData"
}

describe("Tag", () => {
  afterEach(() => {
    vi.clearAllMocks()
    cleanupRtl()
  })

  describe("display mode (without onClick)", () => {
    it("renders tag name", () => {
      render(<Tag tag={mockTag} />)
      expect(screen.getByText("Test Tag")).toBeInTheDocument()
    })

    it("applies custom className", () => {
      const { container } = render(<Tag tag={mockTag} className="custom-class" />)
      expect(container.querySelector(".Tag")).toHaveClass("custom-class")
    })

    it("renders as Badge without Button wrapper", () => {
      const { container } = render(<Tag tag={mockTag} />)
      expect(container.querySelector("Button")).not.toBeInTheDocument()
      expect(container.querySelector(".tag-item")).toBeInTheDocument()
    })

    it("does not render add icon when icon is not specified", () => {
      const { container } = render(<Tag tag={mockTag} />)
      expect(container.querySelector(".add-icon")).not.toBeInTheDocument()
    })
  })

  describe("interactive mode (with onClick)", () => {
    it("renders as Button when onClick is provided", () => {
      const handleClick = vi.fn()
      render(<Tag tag={mockTag} onClick={handleClick} />)
      const button = screen.getByRole("button")
      expect(button).toBeInTheDocument()
    })

    it("calls onClick when clicked", () => {
      const handleClick = vi.fn()
      render(<Tag tag={mockTag} onClick={handleClick} />)
      const button = screen.getByRole("button")
      fireEvent.click(button)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it("applies custom className to Button", () => {
      const { container } = render(
        <Tag tag={mockTag} onClick={vi.fn()} className="custom-class" />
      )
      const button = container.querySelector("Button")
      expect(button).toHaveClass("custom-class")
    })
  })

  describe("add icon", () => {
    it("renders add icon when icon='add'", () => {
      const { container } = render(<Tag tag={mockTag} icon="add" />)
      expect(container.querySelector(".add-icon")).toBeInTheDocument()
    })

    it("renders add icon in interactive mode", () => {
      const { container } = render(<Tag tag={mockTag} icon="add" onClick={vi.fn()} />)
      expect(container.querySelector(".add-icon")).toBeInTheDocument()
    })
  })

  describe("Badge styling", () => {
    it("applies secondary variant to Badge", () => {
      const { container } = render(<Tag tag={mockTag} />)
      const badge = container.querySelector(".tag-item")
      expect(badge).toHaveClass("badge-secondary")
    })

    it("includes Tag class and tag-item class", () => {
      const { container } = render(<Tag tag={mockTag} />)
      const root = container.querySelector(".Tag")
      expect(root).toBeInTheDocument()
      const badge = container.querySelector(".tag-item")
      expect(badge).toBeInTheDocument()
    })
  })
})
