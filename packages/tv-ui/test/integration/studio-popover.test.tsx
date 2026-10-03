/**
 * Studios in the scene info panel open a popover with the studio's card (linking to it in Stash) and a button showing
 * its scenes in the feed (in the temporary channel). A scene has only one studio, so there's no adding a studio to the
 * temporary channel's filter. How popovers open and close, and their cards' links, are covered by the tag popover's
 * tests.
 *
 * @see docs/entity-popovers.md
 */

import { describe, expect, it } from "vitest";
import { within } from "@testing-library/react";
import { setupIntegrationTest } from "./helpers/harness";
import {
  bootShowingFields,
  click,
  feedDoesNotShow,
  feedShows,
  openEntityPopover,
  showTemporaryEntityFilter,
  temporaryChannelFilter,
} from "./helpers/entity-popovers";

setupIntegrationTest();

// "Prism Pictures" made "Aurora Ascending" and "Blueprint Boulevard". Of the scenes with the "Alpha" and "Gamma" tags,
// it made "Aurora Ascending" only.
const STUDIO = "Prism Pictures";
const alpha = { id: "tag-alpha", name: "Alpha" };
const gamma = { id: "tag-gamma", name: "Gamma" };

describe("Studio popover", () => {
  it("shows the studio's scenes in the feed, in a temporary channel", async () => {
    const app = await bootShowingFields(["studio"]);
    await showTemporaryEntityFilter("tag", alpha, gamma);
    await feedShows(app, "Aurora Ascending");

    const popover = await openEntityPopover(app, STUDIO);
    expect(await within(popover).findByRole("heading", { name: STUDIO })).toBeInTheDocument();
    click(within(popover).getByRole("button", { name: "Show scenes from this studio" }));

    await feedShows(app, "Blueprint Boulevard");
    expect((await temporaryChannelFilter())?.name).toBe(STUDIO);

    await app.unmount();
  });

  it("doesn't offer to add the studio to, or remove it from, the temporary channel's filter", async () => {
    const app = await bootShowingFields(["studio"]);
    await showTemporaryEntityFilter("studio", { id: "studio-prism", name: STUDIO });
    await feedShows(app, "Aurora Ascending");
    await feedDoesNotShow(app, "Grotto Glow");

    const popover = await openEntityPopover(app, STUDIO);

    expect(within(popover).getByRole("button", { name: "Show scenes from this studio" })).toBeInTheDocument();
    expect(within(popover).queryByRole("button", { name: "Add to channel filter" })).not.toBeInTheDocument();
    expect(within(popover).queryByRole("button", { name: "Remove from channel filter" })).not.toBeInTheDocument();

    await app.unmount();
  });
});
