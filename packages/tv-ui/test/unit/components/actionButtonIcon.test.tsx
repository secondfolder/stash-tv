import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { ActionButtonIcon } from "../../../src/components/action-buttons/ActionButtonBase";
import type { ActionButtonIconSource } from "../../../src/components/action-buttons/icons";
// RTL cleanup runs centrally in test/setup.ts

/**
 * Tests ActionButtonIcon's icon-source resolution: string sources render as
 * <img>, per-state maps resolve the current state's icon, and unknown sources
 * render nothing (logged) rather than throwing.
 */

describe("ActionButtonIcon", () => {
  it("renders string icon sources as images", () => {
    const icons: Record<string, ActionButtonIconSource> = {
      default: "data:image/svg+xml,<svg></svg>",
    };
    const { container } = render(
      <ActionButtonIcon iconDefinition={icons} state="default" className="custom" />
    );

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "data:image/svg+xml,<svg></svg>");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveClass("ActionButtonIcon", "size-standard", "custom");
  });

  it("renders string icon sources at the small size", () => {
    const icons: Record<string, ActionButtonIconSource> = { default: "icon.png" };
    const { container } = render(
      <ActionButtonIcon iconDefinition={icons} state="default" size="small" />
    );

    expect(container.querySelector("img")).toHaveClass("size-small");
  });

  it("resolves the current state's icon from a per-state map", () => {
    const icons: Record<string, ActionButtonIconSource> = {
      active: "active.png",
      default: "default.png",
    };
    const { container } = render(
      <ActionButtonIcon iconDefinition={icons} state="active" />
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "active.png");
  });

  it("renders nothing for an icon source it cannot resolve", () => {
    // Unknown shapes fall through to the error log path, not a throw.
    // Build an object outside the accepted icon types on purpose.
    const unknownShape = { unknown: true } as unknown as Parameters<
      typeof ActionButtonIcon<"default">
    >[0]["iconDefinition"];
    const { container } = render(
      <ActionButtonIcon iconDefinition={unknownShape} state="default" />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});
