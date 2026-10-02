import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { LineLayoutEditor } from ".";
import { Layout, lineItems } from "./line-layout";

const words = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"];

/** The editor with plain words as its items, keeping its own layout */
function WordLayoutEditor({ initialLayout, availableBeside }: { initialLayout: Layout<string>, availableBeside?: boolean }) {
  const [layout, setLayout] = useState(initialLayout);
  return <div style={{ maxWidth: 600, padding: "1em", background: "#202b33", color: "white" }}>
    <LineLayoutEditor<string>
      layout={layout}
      onChange={setLayout}
      getKey={word => word}
      getAvailable={current => words.filter(word => !current.some(line => lineItems(line).includes(word)))}
      renderItem={word => <span>{word}</span>}
      itemLabel={word => word}
      availableHint="Drag the words you want into the section above"
      emptyHint="No words. Drag some up from below."
      availableBeside={availableBeside}
    />
    <pre style={{ marginTop: "1em", color: "#aaa" }}>{JSON.stringify(layout)}</pre>
  </div>;
}

const meta = {
  title: "Components/Line Layout Editor",
  component: WordLayoutEditor,
  tags: ["autodocs"],
  args: {
    initialLayout: [["Alpha", "Beta"], { left: ["Gamma"], right: ["Delta"] }, ["Epsilon"]],
  },
} satisfies Meta<typeof WordLayoutEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AvailableBeside: Story = {
  args: { availableBeside: true },
};

export const Empty: Story = {
  args: { initialLayout: [] },
};
