/**
 * The command palette: a text field (or custom input) with results to pick from, notes and buttons, closed with
 * Escape or a click outside.
 *
 * @see docs/keyboard-shortcuts.md § "The command palette"
 */

import { describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette, CommandPaletteToken, type CommandPaletteProps } from "../../../src/components/CommandPalette";

const fruit = ["Apple", "Banana", "Cherry"];

/** A palette searching a list, as a caller would use it */
function Search({ onPick, ...props }: Partial<CommandPaletteProps> & { onPick: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const items = fruit
    .filter((name) => name.toLowerCase().includes(query.toLowerCase()))
    .map((name) => ({ id: name, label: name, onSelect: () => onPick(name) }));
  return <CommandPalette
    show
    onClose={() => {}}
    label="Fruit"
    placeholder="Search fruit"
    query={query}
    onQueryChange={setQuery}
    items={items}
    emptyText="No fruit"
    {...props}
  />;
}

describe("CommandPalette", () => {
  it("shows the placeholder in its text field, which has focus", async () => {
    render(<Search onPick={() => {}} />);

    const field = screen.getByPlaceholderText("Search fruit");
    await waitFor(() => expect(field).toHaveFocus());
  });

  it("lists the caller's results for what's typed, or says there are none", async () => {
    render(<Search onPick={() => {}} />);

    await userEvent.type(screen.getByPlaceholderText("Search fruit"), "an");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Banana"]);

    await userEvent.type(screen.getByPlaceholderText("Search fruit"), "x");
    expect(screen.getByText("No fruit")).toBeInTheDocument();
  });

  it("picks a result with the arrow keys and Enter", async () => {
    const onPick = vi.fn();
    render(<Search onPick={onPick} />);
    const field = screen.getByPlaceholderText("Search fruit");
    field.focus();

    expect(screen.getByRole("option", { name: "Apple" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");

    // Down past the last wraps round to the first, then up to the last
    expect(onPick).toHaveBeenCalledWith("Cherry");
  });

  it("picks a result clicked", async () => {
    const onPick = vi.fn();
    render(<Search onPick={onPick} />);

    await userEvent.click(screen.getByRole("option", { name: "Banana" }));

    expect(onPick).toHaveBeenCalledWith("Banana");
  });

  it("gives the caller the keys pressed in a custom input, which shows the placeholder while empty", async () => {
    const keys: string[] = [];
    render(<CommandPalette
      show
      onClose={() => {}}
      label="Keys"
      placeholder="Press keys"
      inputContent={null}
      onInputKeyDown={(event) => keys.push(event.key)}
      inputSuffix="{suffix}"
      status="A note"
    />);
    const input = screen.getByRole("textbox", { name: "Keys" });
    await waitFor(() => expect(input).toHaveFocus());

    await userEvent.keyboard("ab");

    expect(keys).toEqual(["a", "b"]);
    expect(input).toHaveTextContent("Press keys");
    expect(screen.getByText("{suffix}")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("A note");
  });

  it("removes a token clicked in a custom input, leaving focus in the input", async () => {
    function Tokens() {
      const [tokens, setTokens] = useState(["a", "b"]);
      return <CommandPalette
        show
        onClose={() => {}}
        label="Keys"
        placeholder="Press keys"
        inputContent={tokens.map((token) => (
          <CommandPaletteToken key={token} removeLabel={`Remove ${token}`} onRemove={() => setTokens(tokens.filter((other) => other !== token))}>
            {token}
          </CommandPaletteToken>
        ))}
      />;
    }
    render(<Tokens />);
    const input = screen.getByRole("textbox", { name: "Keys" });
    await waitFor(() => expect(input).toHaveFocus());

    await userEvent.click(screen.getByRole("button", { name: "Remove a" }));

    expect(input).toHaveTextContent(/^b$/);
    expect(input).toHaveFocus();
  });

  it("doesn't let a token without onRemove be removed", () => {
    render(<CommandPalette
      show
      onClose={() => {}}
      label="Keys"
      placeholder="Press keys"
      inputContent={<CommandPaletteToken>{"{1-5}"}</CommandPaletteToken>}
    />);

    expect(screen.getByRole("textbox", { name: "Keys" })).toHaveTextContent("{1-5}");
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  it("calls its buttons' actions, but not a disabled one's", async () => {
    const save = vi.fn();
    const cancel = vi.fn();
    render(<CommandPalette
      show
      onClose={() => {}}
      label="Keys"
      placeholder="Press keys"
      actions={[{ label: "Cancel", onClick: cancel, disabled: true }, { label: "Done", onClick: save }]}
    />);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    expect(save).toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("closes with Escape", async () => {
    const onClose = vi.fn();
    render(<Search onPick={() => {}} onClose={onClose} />);
    await waitFor(() => expect(screen.getByPlaceholderText("Search fruit")).toHaveFocus());

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("darkens and blurs what's behind it with its backdrop, unless told not to", () => {
    const { unmount } = render(<Search onPick={() => {}} />);
    expect(document.querySelector(".CommandPalette-backdrop")).not.toHaveClass("unseen");
    unmount();

    render(<Search onPick={() => {}} backdrop={false} />);
    expect(document.querySelector(".CommandPalette-backdrop")).toHaveClass("unseen");
  });

  it.each([true, false])("closes on a click outside it (backdrop shown: %s)", (backdrop) => {
    const onClose = vi.fn();
    render(<Search onPick={() => {}} onClose={onClose} backdrop={backdrop} />);

    // fireEvent: react-bootstrap closes on a click landing on the modal element itself, around the dialog, which is
    // where a click outside the dialog lands. userEvent can't aim at an element's own area outside its children
    const modal = document.querySelector(".CommandPalette.modal");
    if (!(modal instanceof HTMLElement)) throw new Error("No palette");
    fireEvent.mouseDown(modal);
    fireEvent.mouseUp(modal);
    fireEvent.click(modal);

    expect(onClose).toHaveBeenCalled();
  });
});
