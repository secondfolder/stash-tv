/**
 * Performers in the scene info panel open a popover with the performer's card (linking to them in Stash) and buttons:
 * show their scenes in the feed (in the temporary channel), or add them to the temporary channel's performer filter or
 * remove them from it. How popovers open and close, and their cards' links, are covered by the tag popover's tests.
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

// The first slide's scene (fixture scene-7) has "Bob Bold" only. The next is "Foothill Flight", which doesn't.
const NOT_BOB_SCENE = "Foothill Flight";

describe("Performer popover", () => {
  it("opens with the performer's card, their age in the scene, when a performer is clicked", async () => {
    const app = await bootShowingFields(["performers"]);

    const popover = await openEntityPopover(app, "Bob Bold");

    expect(await within(popover).findByRole("heading", { name: /Bob Bold/ })).toBeInTheDocument();
    // Born 1990-09-03, the scene's from 2025-02-14
    expect(within(popover).getByText(/34 years old/)).toBeInTheDocument();
    expect(within(popover).queryByRole("button", { name: "Add to channel filter" })).not.toBeInTheDocument();

    await app.unmount();
  });

  it("shows the performer's scenes in the feed, in a temporary channel", async () => {
    const app = await bootShowingFields(["performers"]);

    const popover = await openEntityPopover(app, "Bob Bold");
    click(within(popover).getByRole("button", { name: "Show scenes with this performer" }));

    await feedShows(app, "Blueprint Boulevard");
    await feedDoesNotShow(app, NOT_BOB_SCENE);
    expect((await temporaryChannelFilter())?.name).toBe("Bob Bold");

    await app.unmount();
  });

  it("adds the performer to, and removes them from, the temporary channel's performer filter", async () => {
    const app = await bootShowingFields(["performers"]);
    // "Alice Amaze" is in "Foothill Flight" (with "Carol Chase"), "Aurora Ascending" and "Blueprint Boulevard"
    await showTemporaryEntityFilter("performer", { id: "performer-alice", name: "Alice Amaze" });
    await feedShows(app, "Aurora Ascending");

    let popover = await openEntityPopover(app, "Carol Chase");
    click(within(popover).getByRole("button", { name: "Add to channel filter" }));

    await feedDoesNotShow(app, "Aurora Ascending");
    expect((await temporaryChannelFilter())?.name).toBe("Alice Amaze & Carol Chase");

    popover = await openEntityPopover(app, "Carol Chase");
    click(within(popover).getByRole("button", { name: "Remove from channel filter" }));

    await feedShows(app, "Aurora Ascending");
    expect((await temporaryChannelFilter())?.name).toBe("Alice Amaze");

    await app.unmount();
  });
});
