import { describe, it, expect } from "vitest"
import React from "react"
import { act, render } from "@testing-library/react"
// RTL cleanup runs centrally in test/setup.ts
import CrtEffect from "../../../src/components/CrtEffect"

/**
 * Every rendered slide has its own CRT effect, so its per-frame animations must only run while the effect can be
 * seen. They're observed through the DOM changes they make (the glitch filter's bands moving).
 *
 * @see AGENTS.md § "Performance"
 */

/** How many DOM changes the effect makes over the given time */
async function domChangesOver(container: HTMLElement, ms: number) {
  let changes = 0
  const observer = new MutationObserver((records) => { changes += records.length })
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true })
  await act(() => new Promise((resolve) => setTimeout(resolve, ms)))
  observer.disconnect()
  return changes
}

describe("CrtEffect", () => {
  it("doesn't animate while it's off", async () => {
    const { container } = render(<CrtEffect enabled={false}>content</CrtEffect>)
    // Let it settle: mounting writes the glitch filter's starting position once
    await domChangesOver(container, 100)

    expect(await domChangesOver(container, 300)).toBe(0)
  })

  it("animates while it's on", async () => {
    const { container } = render(<CrtEffect enabled>content</CrtEffect>)
    await domChangesOver(container, 100)

    expect(await domChangesOver(container, 300)).toBeGreaterThan(0)
  })
})
