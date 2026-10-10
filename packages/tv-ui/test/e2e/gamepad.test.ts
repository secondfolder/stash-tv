import { setTvConfig } from './helpers/stash';
import { bootFeed, expectCurrentSlide, expectFeedback, seekCurrentVideo, shownFeedback, videoState, waitForPlayback } from './helpers/gestures';
import { expect, test } from './helpers/test';
import { currentIndex, currentSlide } from './helpers/feed';
import { addFakeGamepad, buttons, pressButton, setAxis, setButton } from './helpers/gamepad';

/**
 * E2E: a gamepad's controls do the shortcut actions its mapping gives them (a preset's, or the user's own), its sticks
 * seek at a speed set by how far they're pushed, and the settings have a section for choosing the mapping while one's
 * connected.
 *
 * @see docs/gamepad.md
 */

test.afterEach(async ({ request }) => setTvConfig(request, null));

const openGamepadSettings = async (page: import('@playwright/test').Page) => {
  await currentSlide(page).getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Game Controller' }).click();
};

test.describe('With the standard preset', () => {
  test.beforeEach(async ({ page, request }) => {
    await addFakeGamepad(page);
    await bootFeed(page, request);
  });

  test('A pauses and plays the video', async ({ page }) => {
    await pressButton(page, buttons.south);
    await expect.poll(async () => (await videoState(currentSlide(page))).paused).toBe(true);

    await pressButton(page, buttons.south);
    await expect.poll(async () => (await videoState(currentSlide(page))).paused).toBe(false);
  });

  test('the d-pad moves to the next and previous media', async ({ page }) => {
    const index = await currentIndex(page);

    await pressButton(page, buttons.dpadDown);
    await expectCurrentSlide(page, index + 1);

    await pressButton(page, buttons.dpadUp);
    await expectCurrentSlide(page, index);
  });

  test('holding d-pad → fast forwards, and d-pad ↑ speeds it up rather than going back', async ({ page }) => {
    await seekCurrentVideo(page, 2);
    const index = await currentIndex(page);

    await setButton(page, buttons.dpadRight, true);
    await expectFeedback(page, '2x', 'play');
    await pressButton(page, buttons.dpadUp);
    await expectFeedback(page, '3x', 'play');
    await setButton(page, buttons.dpadRight, false);

    await expect.poll(async () => (await videoState(currentSlide(page))).playbackRate).toBe(1);
    expect(await currentIndex(page)).toBe(index);
  });

  test('the actions offered for a control leave out rating, which needs digits typed', async ({ page }) => {
    await openGamepadSettings(page);
    await page.getByRole('button', { name: 'Custom' }).click();
    await page.getByRole('combobox', { name: 'Action for Y' }).click();

    await expect(page.getByRole('option', { name: 'Unset rating' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Rate', exact: true })).toHaveCount(0);
  });

  test('the settings show the gamepad and choosing a preset changes what it does', async ({ page }) => {
    await openGamepadSettings(page);
    const standard = page.getByRole('button', { name: 'Standard', pressed: true });
    await expect(standard).toBeVisible();
    const front = page.locator('.GamepadDiagram.mapping.view-front');
    await expect(front).toHaveAttribute('aria-label', /D-pad ↓: Next(,|$)/);
    // The shoulders and triggers are in a view of their own
    await expect(page.locator('.GamepadDiagram.mapping.view-top')).toHaveAttribute('aria-label', /LT: Jump back/);
    // Hovering over a label picks out its line and control
    await front.locator('.callout[data-control="south"] text').hover();
    await expect(front.locator('.callout[data-control="south"]')).toHaveClass(/hovered/);
    await expect(front.locator('.control.hovered')).toHaveCount(1);
    // ...as does hovering over the control itself
    await front.locator('g.control').filter({ has: page.locator('text', { hasText: /^B$/ }) }).hover({ force: true });
    await expect(front.locator('.callout[data-control="east"]')).toHaveClass(/hovered/);
    // A control that does nothing lights up too (it has no label to)
    await front.locator('.control[data-control="home"]').hover({ force: true });
    await expect(front.locator('.control.hovered[data-control="home"]')).toHaveCount(1);
    await expect(front.locator('.callout.hovered')).toHaveCount(0);

    await page.getByRole('button', { name: 'Sticks' }).click();

    await expect(page.getByRole('button', { name: 'Sticks', pressed: true })).toBeVisible();
    await expect(page.locator('.GamepadDiagram.mapping.view-front')).toHaveAttribute('aria-label', /Left stick ←: Rewind, Left stick →: Fast fwd/);
  });

  test('a custom mapping gives a control the action chosen for it', async ({ page }) => {
    await openGamepadSettings(page);
    await page.getByRole('button', { name: 'Custom' }).click();
    await page.getByRole('combobox', { name: 'Action for B' }).click();
    await page.getByRole('option', { name: 'Mute/unmute' }).click();

    // Hovering over a control in the diagram lights up its field until it's no longer hovered over
    const front = page.locator('.GamepadDiagram.mapping.view-front');
    await front.locator('.control[data-control="east"]').hover({ force: true });
    await expect(page.locator('.custom-controls [data-control="east"]')).toHaveClass(/hovered/);
    await page.mouse.move(0, 0);
    await expect(page.locator('.custom-controls [data-control="east"]')).not.toHaveClass(/hovered/);
    // ...but hovering over a field lights up just its control (and label) in the diagram, not the field
    await page.locator('.custom-controls [data-control="west"]').hover();
    await expect(front.locator('.control[data-control="west"]')).toHaveClass(/hovered/);
    await expect(front.locator('.callout[data-control="west"]')).toHaveClass(/hovered/);
    await expect(page.locator('.custom-controls [data-control="west"]')).not.toHaveClass(/hovered/);
    // A stick press lights up just the stick's middle
    await page.locator('.custom-controls [data-control="l3"]').hover();
    await expect(front.locator('.stick-press.hovered')).toHaveCount(1);
    await expect(front.locator('.stick-part.hovered')).toHaveCount(1);

    // Clicking a control in the diagram shows its field, lit up for a moment
    await page.locator('.GamepadDiagram.mapping.view-front .callout[data-control="south"] text').click();
    const field = page.locator('.custom-controls [data-control="south"]');
    await expect(field).toHaveClass(/flashing/);
    await expect(field).toBeInViewport();

    // A stick direction (or trigger) can seek instead, at a speed set by how far it's pushed
    await page.getByRole('combobox', { name: 'Action for Right stick →' }).click();
    await page.getByRole('option', { name: /^Fast forward \(faster the further it's pushed\)/ }).click();
    await expect(page.locator('.custom-controls [data-control="right-stick-right"]')).toContainText('Fast forward');
    await page.getByRole('combobox', { name: 'Action for RT' }).click();
    await page.getByRole('option', { name: /^Rewind \(faster the harder it's pressed\)/ }).click();
    await expect(page.locator('.GamepadDiagram.mapping.view-front')).toHaveAttribute('aria-label', /Right stick →: Fast fwd/);
    await expect(page.locator('.GamepadDiagram.mapping.view-top')).toHaveAttribute('aria-label', /RT: Rewind/);

    const volume = () => currentSlide(page).locator('video').first().evaluate((video: HTMLVideoElement) => video.volume);
    const before = await volume();

    await pressButton(page, buttons.east);

    // Muted, or unmuted if it started muted
    await expect.poll(volume).toBe(before ? 0 : 1);
  });
});

test.describe('With the sticks preset', () => {
  test.beforeEach(async ({ page, request }) => {
    await addFakeGamepad(page);
    await bootFeed(page, request, { gamepadMapping: { preset: 'sticks', custom: null } });
    await seekCurrentVideo(page, 2);
  });

  test('pushing the left stick sideways seeks faster the further it\'s pushed', async ({ page }) => {
    // Just past the deadzone it plays at 1.5x, as a hold on the right of the video does
    await setAxis(page, 0, 0.2);
    await expectFeedback(page, '1.5x', 'play');

    // All the way, it skips through (the video's paused while its time moves on), by at most a third of the video a
    // second
    await setAxis(page, 0, 1);
    await expect.poll(() => shownFeedback(page)).toMatchObject({ icon: 'forward' });
    const { duration } = await videoState(currentSlide(page));
    const before = (await videoState(currentSlide(page))).currentTime;
    await page.waitForTimeout(500);
    expect((await videoState(currentSlide(page))).currentTime - before).toBeGreaterThan(duration / 12);

    await setAxis(page, 0, 0);
    await expect.poll(() => page.locator('.FeedbackOverlay:not(.fade-out)').count()).toBe(0);
  });

  test('pushing the left stick down moves to the next media', async ({ page }) => {
    const index = await currentIndex(page);

    await setAxis(page, 1, 1);
    await setAxis(page, 1, 0);

    await expectCurrentSlide(page, index + 1);
  });
});

test('the settings have no gamepad section without a gamepad', async ({ page, request }) => {
  await bootFeed(page, request);
  await currentSlide(page).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Game Controller' })).toHaveCount(0);
});

test('a fake gamepad chosen in the developer options shows the settings, works, and is kept on the device', async ({ page, request }) => {
  await setTvConfig(request, { showDevOptions: true });
  await page.goto('/');
  await waitForPlayback(page);
  await currentSlide(page).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Game Controller' })).toHaveCount(0);

  await page.getByRole('heading', { name: 'Developer Options' }).click();
  await page.getByRole('combobox', { name: 'Fake gamepad' }).click();
  await page.getByRole('option', { name: 'PlayStation' }).click();
  await expect(page.getByRole('heading', { name: 'Game Controller' })).toBeVisible();
  await page.evaluate(() => window.fakeGamepad!.press('south'));
  await expect.poll(async () => (await videoState(currentSlide(page))).paused).toBe(true);

  await page.reload();
  await currentSlide(page).getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Game Controller' }).click();
  await expect(page.locator('.GamepadDiagram.mapping.view-front')).toHaveAttribute('aria-label', /✕: Play\/pause/);

  await page.getByRole('heading', { name: 'Developer Options' }).click();
  await page.getByRole('combobox', { name: 'Fake gamepad' }).click();
  await page.getByRole('option', { name: 'None' }).click();
  await expect(page.getByRole('heading', { name: 'Game Controller' })).toHaveCount(0);
});
