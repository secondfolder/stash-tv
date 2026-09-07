import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Tag } from "../../../src/components/tags/tag"
// RTL cleanup runs centrally in test/setup.ts

// Import the type used by Tag
import type { SlimTag } from "../../../src/components/EditTagSelectionForm"

const mockTag: SlimTag = {
  id: "tag1",
  name: "Test Tag",
  aliases: [],
}

describe("Tag", () => {
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
      render(<Tag tag={mockTag} />)
      expect(screen.queryByRole("button")).not.toBeInTheDocument()
      expect(screen.getByText("Test Tag")).toBeInTheDocument()
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
      expect(screen.getByRole("button")).toBeInTheDocument()
    })

    it("calls onClick when clicked", async () => {
      const handleClick = vi.fn()
      render(<Tag tag={mockTag} onClick={handleClick} />)
      await userEvent.click(screen.getByRole("button"))
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it("applies custom className to Button", () => {
      render(<Tag tag={mockTag} onClick={vi.fn()} className="custom-class" />)
      expect(screen.getByRole("button")).toHaveClass("custom-class")
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
  })
})
