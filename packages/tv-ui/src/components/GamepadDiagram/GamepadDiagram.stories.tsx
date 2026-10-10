import type { Meta, StoryObj } from "@storybook/react";
import { GamepadDiagram } from ".";
import { GAMEPAD_PRESETS } from "../../helpers/gamepad/presets";

const meta = {
  title: "Components/Gamepad Diagram",
  component: GamepadDiagram,
  tags: ["autodocs"],
  args: {
    bindings: GAMEPAD_PRESETS.standard.bindings,
    layout: "xbox",
    size: "large",
  },
} satisfies Meta<typeof GamepadDiagram>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The standard preset, labelled */
export const Standard: Story = {};

/** The sticks preset, with PlayStation's names for the face buttons */
export const SticksPlayStation: Story = {
  args: { bindings: GAMEPAD_PRESETS.sticks.bindings, layout: "playstation" },
};

/** Controls held down are lit up */
export const Pressed: Story = {
  args: { pressedControls: new Set(["dpad-left", "dpad-up", "south"]) },
};

/** The preview size, without labels, as the preset picker shows */
export const Small: Story = {
  args: { size: "small" },
};

/** The top edge, with the shoulders and triggers */
export const TopEdge: Story = {
  args: { view: "top" },
};
