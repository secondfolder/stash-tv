import type { Page } from '@playwright/test';

/**
 * A pretend gamepad for E2E tests: `navigator.getGamepads()` returns it, and the tests press its buttons and push its
 * sticks. Browsers only report a real gamepad once it's used, so it's the only way to test gamepads.
 */

declare global {
  interface Window {
    __fakeGamepad?: {
      id: string,
      index: number,
      connected: boolean,
      mapping: string,
      timestamp: number,
      buttons: { pressed: boolean, touched: boolean, value: number }[],
      axes: number[],
    },
  }
}

/** Gives the page a gamepad, connected from the start. Call before the page is loaded. */
export async function addFakeGamepad(page: Page, { id = 'Xbox Wireless Controller (STANDARD GAMEPAD)' } = {}) {
  await page.addInitScript((gamepadId) => {
    const gamepad = {
      id: gamepadId,
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    window.__fakeGamepad = gamepad;
    navigator.getGamepads = () => [gamepad as unknown as Gamepad, null, null, null];
  }, id);
}

/** Waits for the app to have polled the gamepad (it does once a frame) */
async function nextFrames(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function setButton(page: Page, index: number, pressed: boolean) {
  await page.evaluate(({ index, pressed }) => {
    const button = window.__fakeGamepad!.buttons[index];
    button.pressed = pressed;
    button.value = pressed ? 1 : 0;
  }, { index, pressed });
  await nextFrames(page);
}

/** Presses a button and lets go of it */
export async function pressButton(page: Page, index: number) {
  await setButton(page, index, true);
  await setButton(page, index, false);
}

/** Pushes a stick along an axis (0 left X, 1 left Y, 2 right X, 3 right Y), -1 to 1 */
export async function setAxis(page: Page, axis: number, value: number) {
  await page.evaluate(({ axis, value }) => {
    window.__fakeGamepad!.axes[axis] = value;
  }, { axis, value });
  await nextFrames(page);
}

/** The standard mapping's button numbers */
export const buttons = { south: 0, east: 1, west: 2, north: 3, dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15 };
