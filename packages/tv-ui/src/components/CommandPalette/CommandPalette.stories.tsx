import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { Badge } from "react-bootstrap";
import { fn } from "@storybook/test";
import { CommandPalette } from ".";

const meta = {
  title: "Components/Command Palette",
  component: CommandPalette,
  tags: ["autodocs"],
  args: {
    show: true,
    onClose: fn(),
    label: "Command palette",
    placeholder: "Search…",
    backdrop: true,
  },
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

const commands = ["Toggle fullscreen", "Toggle subtitles", "Toggle CRT effect", "Next media", "Previous media"];

/** Text mode: searching a list of commands, picked with the arrow keys and Enter, or a click */
export const Search: Story = {
  render: (args) => {
    const [query, setQuery] = useState("");
    const items = commands
      .filter((command) => command.toLowerCase().includes(query.toLowerCase()))
      .map((command) => ({ id: command, label: command, onSelect: fn() }));
    return <CommandPalette {...args} query={query} onQueryChange={setQuery} items={items} emptyText="No commands match" />;
  },
};

/** Custom input: recording keys pressed, as the keyboard shortcut settings do */
export const RecordKeys: Story = {
  args: { placeholder: "Type shortcut" },
  render: (args) => {
    const [keys, setKeys] = useState<string[]>([]);
    return <CommandPalette
      {...args}
      inputContent={keys.map((key, index) => <Badge key={index} className="tag-item" variant="secondary">{key}</Badge>)}
      onInputKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") return;
        event.preventDefault();
        setKeys((previous) => [...previous, event.key === " " ? "Space" : event.key]);
      }}
      inputSuffix={keys.length ? "{1-5}" : null}
      status={keys.length > 2 ? <span className="text-warning">That's a long one.</span> : null}
      actions={[
        { label: "Clear", onClick: () => setKeys([]), disabled: !keys.length, focusInput: true },
        { label: "Done", variant: "primary", onClick: fn(), disabled: !keys.length },
      ]}
    />;
  },
};

/** Without its backdrop, the page behind isn't darkened or blurred */
export const WithoutBackdrop: Story = {
  ...Search,
  args: { backdrop: false },
};
