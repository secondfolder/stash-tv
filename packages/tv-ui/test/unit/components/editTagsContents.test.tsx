import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
// RTL cleanup runs centrally in test/setup.ts
import { EditTagsContents } from "../../../src/components/EditTagsContents"
import type { SlimTag } from "../../../src/components/EditTagSelectionForm"

// Mock EditTagSelectionForm since it's complex
vi.mock("../../../src/components/EditTagSelectionForm", () => ({
  EditTagSelectionForm: ({ initialTags, save, cancel }: any) => (
    <div data-testid="edit-tag-form">
      <div data-testid="tags-count">{initialTags.length}</div>
      <button onClick={() => save(initialTags)}>Save</button>
      <button onClick={cancel}>Cancel</button>
    </div>
  ),
  SlimTag: {}
}))

const mockTags: SlimTag[] = [
  { id: "tag1", name: "Tag 1", aliases: [] },
  { id: "tag2", name: "Tag 2", aliases: [] }
]

const mockPrimaryTag: SlimTag = {
  id: "tag-primary",
  name: "Primary Tag",
  aliases: [],
}

describe("EditTagsContents", () => {
  it("renders EditTagSelectionForm", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={mockTags}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    expect(screen.getByTestId("edit-tag-form")).toBeInTheDocument()
  })

  it("passes initialTags to EditTagSelectionForm", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={mockTags}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    expect(screen.getByTestId("tags-count")).toHaveTextContent("2")
  })

  it("passes save callback to EditTagSelectionForm", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={mockTags}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    const saveButton = screen.getByText("Save")
    saveButton.click()
    expect(handleSave).toHaveBeenCalledWith(mockTags)
  })

  it("passes cancel callback to EditTagSelectionForm", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={mockTags}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    const cancelButton = screen.getByText("Cancel")
    cancelButton.click()
    expect(handleCancel).toHaveBeenCalled()
  })

  it("passes pinnedTagIds to EditTagSelectionForm when provided", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={mockTags}
        pinnedTagIds={["tag1"]}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    expect(screen.getByTestId("edit-tag-form")).toBeInTheDocument()
  })

  it("does not render primary tag note when primaryTag is not provided", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={mockTags}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    expect(screen.queryByTestId("primary-tag-note")).not.toBeInTheDocument()
  })

  it("renders primary tag note when primaryTag is provided", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={mockTags}
        primaryTag={mockPrimaryTag}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    expect(screen.getByText(`Marker's primary tag is "${mockPrimaryTag.name}".`)).toBeInTheDocument()
  })

  it("renders primary tag note with correct tag name", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    const customPrimaryTag: SlimTag = {
      id: "custom-primary",
      name: "Custom Primary",
      aliases: [],
    }
    render(
      <EditTagsContents
        initialTags={mockTags}
        primaryTag={customPrimaryTag}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    expect(screen.getByText(`Marker's primary tag is "${customPrimaryTag.name}".`)).toBeInTheDocument()
  })

  it("handles empty initialTags array", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={[]}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    expect(screen.getByTestId("tags-count")).toHaveTextContent("0")
  })

  it("handles primaryTag as null", () => {
    const handleSave = vi.fn()
    const handleCancel = vi.fn()
    render(
      <EditTagsContents
        initialTags={mockTags}
        primaryTag={null}
        save={handleSave}
        cancel={handleCancel}
      />
    )
    expect(screen.queryByTestId("primary-tag-note")).not.toBeInTheDocument()
  })
})
