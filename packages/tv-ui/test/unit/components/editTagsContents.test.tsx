import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
// RTL cleanup runs centrally in test/setup.ts
import { EditTagsContents } from "../../../src/components/EditTagsContents"
import type { SlimTag } from "../../../src/components/EditTagSelectionForm"

/**
 * EditTagsContents is a thin composition around EditTagSelectionForm (mocked
 * here) plus the marker primary-tag note. The tests verify prop forwarding
 * through the mock and the note's conditional rendering.
 */

// The mock echoes its props so tests can assert what was actually forwarded.
vi.mock("../../../src/components/EditTagSelectionForm", () => ({
  EditTagSelectionForm: ({
    initialTags,
    pinnedTagIds,
    save,
    cancel,
  }: {
    initialTags: SlimTag[]
    pinnedTagIds?: string[]
    save: (tags: SlimTag[]) => void
    cancel: () => void
  }) => (
    <div data-testid="edit-tag-form">
      <div data-testid="tags-count">{initialTags.length}</div>
      <div data-testid="pinned-tag-ids">{pinnedTagIds?.join(",") ?? ""}</div>
      <button onClick={() => save(initialTags)}>Save</button>
      <button onClick={cancel}>Cancel</button>
    </div>
  ),
}))

const mockTags: SlimTag[] = [
  { id: "tag1", name: "Tag 1", aliases: [] },
  { id: "tag2", name: "Tag 2", aliases: [] },
]

function renderContents(
  overrides: Partial<Parameters<typeof EditTagsContents>[0]> = {}
) {
  const props = {
    initialTags: mockTags,
    save: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  }
  render(<EditTagsContents {...props} />)
  return props
}

describe("EditTagsContents", () => {
  it("forwards initialTags to the tag selection form", () => {
    renderContents()
    expect(screen.getByTestId("tags-count")).toHaveTextContent("2")
  })

  it("forwards pinnedTagIds to the tag selection form", () => {
    renderContents({ pinnedTagIds: ["tag1", "tag2"] })
    expect(screen.getByTestId("pinned-tag-ids")).toHaveTextContent("tag1,tag2")
  })

  it("wires the form's save and cancel actions to its props", async () => {
    const props = renderContents()

    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(props.save).toHaveBeenCalledWith(mockTags)

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(props.cancel).toHaveBeenCalledTimes(1)
  })

  it("shows the marker's primary tag name when provided", () => {
    renderContents({ primaryTag: { id: "tag-primary", name: "Primary Tag", aliases: [] } })
    expect(
      screen.getByText('Marker\'s primary tag is "Primary Tag".')
    ).toBeInTheDocument()
  })

  it("hides the primary tag note when there is no primary tag", () => {
    renderContents()
    expect(screen.queryByText(/Marker's primary tag is/)).not.toBeInTheDocument()

    renderContents({ primaryTag: null })
    expect(screen.queryByText(/Marker's primary tag is/)).not.toBeInTheDocument()
  })
})
