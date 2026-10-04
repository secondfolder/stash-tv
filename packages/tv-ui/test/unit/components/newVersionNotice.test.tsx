import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from "@apollo/client";
import NewVersionNotice from "../../../src/components/NewVersionNotice";
import { newVersionCheckInterval, unreleasedVersion } from "../../../src/hooks/useNewVersionCheck";
import { reloadFromServer } from "../../../src/helpers/reloadFromServer";

vi.mock("../../../src/helpers/reloadFromServer", () => ({ reloadFromServer: vi.fn() }));

const runningVersion = "1.2.0";

/** The version Stash reports for the installed plugin, or an error to fail the query with */
let installed: string | Error;
let queryCount: number;
let now: number;

function renderNotice() {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(() => new Observable(observer => {
      queryCount++;
      if (installed instanceof Error) {
        observer.error(installed);
        return;
      }
      observer.next({
        data: {
          plugins: [
            { __typename: "Plugin", id: "some-other-plugin", version: "9.9.9" },
            { __typename: "Plugin", id: "stash-tv", version: installed },
          ],
        },
      });
      observer.complete();
    })),
  });
  return render(
    <ApolloProvider client={client}>
      <NewVersionNotice />
    </ApolloProvider>
  );
}

/** Waits for the given number of checks to have been made and their results shown */
async function checksMade(count: number) {
  await waitFor(() => expect(queryCount).toBe(count));
  await act(async () => {});
}

function advanceTime(milliseconds: number) {
  now += milliseconds;
}

// Fired directly: these are events the browser fires, not ones a user does
function bringToForeground() {
  fireEvent(document, new Event("visibilitychange"));
}

function restoreFromBackForwardCache() {
  fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
}

const noticeFor = (version: string) => screen.queryByText(`Stash TV v${version} is available`);

/** @see docs/app-updates.md § "New version check" */
describe("NewVersionNotice", () => {
  beforeEach(() => {
    installed = runningVersion;
    queryCount = 0;
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubEnv("VITE_STASH_TV_VERSION", runningVersion);
    vi.stubEnv("DEV", false);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("tells the user when the installed version differs from the running one", async () => {
    installed = "1.3.0";
    renderNotice();
    expect(await screen.findByText("Stash TV v1.3.0 is available")).toBeInTheDocument();
  });

  it("shows nothing when the running version is the installed one", async () => {
    renderNotice();
    await checksMade(1);
    expect(screen.queryByRole("button", { name: /reload/i })).not.toBeInTheDocument();
  });

  it("checks again when the app is brought back to the foreground", async () => {
    renderNotice();
    await checksMade(1);

    installed = "1.3.0";
    advanceTime(newVersionCheckInterval);
    bringToForeground();

    expect(await screen.findByText("Stash TV v1.3.0 is available")).toBeInTheDocument();
  });

  it("checks again when the page is restored from the back/forward cache", async () => {
    renderNotice();
    await checksMade(1);

    installed = "1.3.0";
    advanceTime(newVersionCheckInterval);
    restoreFromBackForwardCache();

    expect(await screen.findByText("Stash TV v1.3.0 is available")).toBeInTheDocument();
  });

  it("doesn't check again until the check interval has passed", async () => {
    renderNotice();
    await checksMade(1);

    advanceTime(newVersionCheckInterval - 1);
    bringToForeground();
    await act(async () => {});

    expect(queryCount).toBe(1);
  });

  it("stays hidden once dismissed, until a different version is installed", async () => {
    installed = "1.3.0";
    renderNotice();
    await screen.findByText("Stash TV v1.3.0 is available");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(noticeFor("1.3.0")).not.toBeInTheDocument();

    advanceTime(newVersionCheckInterval);
    bringToForeground();
    await checksMade(2);
    expect(noticeFor("1.3.0")).not.toBeInTheDocument();

    installed = "1.4.0";
    advanceTime(newVersionCheckInterval);
    bringToForeground();
    expect(await screen.findByText("Stash TV v1.4.0 is available")).toBeInTheDocument();
  });

  it("reloads from the server when Reload is clicked", async () => {
    installed = "1.3.0";
    renderNotice();

    await userEvent.click(await screen.findByRole("button", { name: /reload/i }));

    expect(reloadFromServer).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when the check fails", async () => {
    installed = new Error("Stash is unreachable");
    renderNotice();
    await checksMade(1);
    expect(screen.queryByRole("button", { name: /reload/i })).not.toBeInTheDocument();
  });

  it("doesn't check in dev", async () => {
    vi.stubEnv("DEV", true);
    installed = "1.3.0";
    renderNotice();
    await act(async () => {});
    expect(queryCount).toBe(0);
  });

  it("doesn't check when running an unreleased build", async () => {
    vi.stubEnv("VITE_STASH_TV_VERSION", unreleasedVersion);
    installed = "1.3.0";
    renderNotice();
    await act(async () => {});
    expect(queryCount).toBe(0);
  });
});
