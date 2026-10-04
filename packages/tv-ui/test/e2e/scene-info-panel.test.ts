import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect } from './helpers/test';
import { graphql, setTvConfig } from './helpers/stash';
import { expectUsableOnScreen } from './helpers/layout';
import { currentSlide, infoPanel, box } from './helpers/feed';

/**
 * E2E tests: customising the scene info panel. Where its edit button and editor sit, and dragging its fields' pills
 * into place, depend on layout and pointer events, so they're only testable here.
 *
 * @see docs/scene-info-panel.md § "Customising the panel"
 * @see docs/scene-info-panel.md § "Moving fields"
 * @see docs/line-layout-editor.md § "Moving items"
 */

/** A layout of the fields the tests use, each on its own line (the default has many more) */
const SIMPLE_LAYOUT = [['studio'], ['title'], ['performers'], ['date']];

/** `setTvConfig`, with the simple layout unless the settings give one */
function setPanelConfig(request: APIRequestContext, state: Record<string, unknown>) {
  return setTvConfig(request, { sceneInfoLayout: SIMPLE_LAYOUT, ...state });
}

async function openInfoPanel(page: Page) {
  await page.goto('/');
  await currentSlide(page).getByRole('button', { name: 'Show scene info' }).click();
  await expect(infoPanel(page)).toHaveClass(/active/);
}

/**
 * Wait for the panel to finish morphing into or out of the editor. Until then, copies of its fields and pills (with
 * the same classes and attributes) are shown over it, moving.
 *
 * @see docs/scene-info-panel.md § "Customising the panel"
 */
async function morphDone(page: Page) {
  await expect(infoPanel(page).locator('.morph-layer')).toHaveCount(0);
}

/** Switch the open panel to its editor */
async function clickEdit(page: Page) {
  await infoPanel(page).getByRole('button', { name: 'Customise info panel' }).click();
  await morphDone(page);
}

async function startEditing(page: Page) {
  await openInfoPanel(page);
  await clickEdit(page);
}

/** Save the editor's changes, back to the panel showing the fields */
async function saveEdits(page: Page) {
  await infoPanel(page).getByRole('button', { name: 'Save' }).click();
  await morphDone(page);
}

/**
 * Click one of a field's controls (its ×, + or options button) as a mouse user would: they're shown, and take the
 * pointer, only while the field's hovered over, so hover over it first.
 */
async function clickFieldControl(button: Locator) {
  await button.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " layout-item ")][1]').hover();
  await button.click();
}

function pill(page: Page, field: string) {
  return infoPanel(page).locator(`.field-pill[data-field="${field}"]`);
}

/** A field's pill among its line's right-aligned fields in the editor, if it's one of them */
function rightAlignedPill(page: Page, field: string) {
  return infoPanel(page).locator(`.line-side.right .field-pill[data-field="${field}"]`);
}

/** Of `items`, the right edge of each row they're on (by where they start vertically), top to bottom */
async function rowRightEdges(items: Locator) {
  return await items.evaluateAll((elements) => {
    const rows = new Map<number, number>();
    for (const element of elements) {
      const { top, right } = element.getBoundingClientRect();
      const row = [...rows.keys()].find((rowTop) => Math.abs(rowTop - top) < 8) ?? top;
      rows.set(row, Math.max(rows.get(row) ?? -Infinity, right));
    }
    return [...rows.entries()].sort(([a], [b]) => a - b).map(([, right]) => right);
  });
}

/** The editor's lines, as the fields on each (each line's items have its index in `data-line`) */
async function editorLayout(page: Page) {
  return await infoPanel(page).locator('.layout-lines [data-line]').evaluateAll((items) => {
    const lines: string[][] = [];
    for (const item of items) {
      const line = lines[Number((item as HTMLElement).dataset.line)] ??= [];
      if (item.classList.contains('field-pill')) line.push((item as HTMLElement).dataset.field ?? '');
    }
    return lines;
  });
}

/** Press on `handle` (its left end by default) and move the pointer to `x`, `y` in steps, as a person would */
async function startDrag(page: Page, handle: Locator, x: number, y: number) {
  const handleBox = await box(handle);
  const isPill = await handle.evaluate((el) => el.classList.contains('field-pill'));
  await page.mouse.move(isPill ? handleBox.x + 8 : handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 15 });
}

/** Drag `handle` to the point `x`, `y` and let go */
async function dragTo(page: Page, handle: Locator, x: number, y: number) {
  await startDrag(page, handle, x, y);
  await page.mouse.up();
}

/**
 * Beyond the right end of a field's line, once the field's been pushed along by the ghost taking its place (by up to a
 * pill's width), which keeps the dragged field in its place while the pointer's still over it
 */
function pastEnd(field: { x: number, width: number }) {
  return field.x + field.width + 150;
}

/**
 * Start recording, every frame, which fields' pills (and which of the editor's toolbar and unused fields) are partway
 * through sliding somewhere (framer-motion moves them with a transform). Read with `slidFields`.
 */
async function recordSlidingFields(page: Page) {
  await page.evaluate(() => {
    const record = window as unknown as { slid: Set<string> };
    record.slid = new Set();
    const sample = () => {
      const sliding = (element: HTMLElement) => (
        /translate/.test(element.style.transform) && !/translate3d\(0px, 0px, 0px\)/.test(element.style.transform)
      );
      for (const pill of document.querySelectorAll<HTMLElement>('[data-current-video="true"] .SceneInfo.editing .field-pill')) {
        if (sliding(pill)) record.slid.add(`${pill.dataset.field}${pill.classList.contains('ghost') ? ' (ghost)' : ''}`);
      }
      for (const section of document.querySelectorAll<HTMLElement>('[data-current-video="true"] .SceneInfo.editing :is(.layout-toolbar, .available-items)')) {
        if (sliding(section)) record.slid.add(section.classList.contains('layout-toolbar') ? 'toolbar' : 'unused fields');
      }
      const background = document.querySelector<HTMLElement>('[data-current-video="true"] .SceneInfo.editing .panel-background');
      if (background && sliding(background)) record.slid.add('background');
      for (const marker of document.querySelectorAll<HTMLElement>('[data-current-video="true"] .SceneInfo.editing .wrapped-line-marker')) {
        if (sliding(marker)) record.slid.add('wrapped line marker');
      }
      requestAnimationFrame(sample);
    };
    sample();
  });
}

async function slidFields(page: Page) {
  await page.waitForTimeout(500);
  return await page.evaluate(() => [...(window as unknown as { slid: Set<string> }).slid].sort());
}

/** The editor's layout every frame for a while, to check it's settled rather than flipping back and forth */
async function layoutsOverTime(page: Page, milliseconds = 800) {
  return await page.evaluate((milliseconds) => new Promise<string[]>((resolve) => {
    const layouts: string[] = [];
    const started = performance.now();
    const sample = () => {
      const lines: string[][] = [];
      for (const item of document.querySelectorAll<HTMLElement>('[data-current-video="true"] .SceneInfo.editing .layout-lines [data-line]')) {
        const line = lines[Number(item.dataset.line)] ??= [];
        if (item.classList.contains('field-pill')) line.push(item.dataset.field ?? '');
      }
      const layout = JSON.stringify(lines);
      if (layouts.at(-1) !== layout) layouts.push(layout);
      if (performance.now() - started < milliseconds) requestAnimationFrame(sample);
      else resolve(layouts);
    };
    sample();
  }), milliseconds);
}

/**
 * Resizes the window (keeping it taller than it's wide) to the first of `widths` at which `holds` does, for tests
 * relying on how things wrap at a width, which moves whenever what's in the pills, or the panel's padding, changes.
 * Returns the width, and fails the test if `holds` doesn't at any of them.
 */
async function resizeUntil(page: Page, widths: number[], height: number, holds: () => Promise<boolean>) {
  for (const width of widths) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    if (await holds()) return width;
  }
  throw new Error(`No width of ${widths[0]}–${widths.at(-1)} that the test's set up needs`);
}

/** Widths from `from` to `to`, every `step` */
function widthsBetween(from: number, to: number, step = 10) {
  return Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
}

/**
 * Record, every frame from the pointer being let go until it's gone, where the dragged field's copy settling into place
 * is and how far it's turned, and whether the element it's settling into is shown. Read with `settlingFrames`.
 */
async function recordSettling(page: Page) {
  await page.evaluate(() => {
    const record = window as unknown as { settling: { x: number, y: number, angle: number, targetShown: boolean }[] };
    record.settling = [];
    const sample = () => {
      const overlay = document.querySelector<HTMLElement>('[data-current-video="true"] .drag-overlay.settling');
      if (!overlay && record.settling.length) return;
      if (overlay) {
        const item = overlay.querySelector('.layout-item')!.getBoundingClientRect();
        const { a, b } = new DOMMatrix(getComputedStyle(overlay).transform);
        const target = document.querySelector('[data-current-video="true"] .layout-item.settling');
        record.settling.push({
          x: item.left + item.width / 2,
          y: item.top + item.height / 2,
          angle: Math.atan2(b, a) * 180 / Math.PI,
          targetShown: !!target && getComputedStyle(target).visibility !== 'hidden',
        });
      }
      requestAnimationFrame(sample);
    };
    window.addEventListener('pointerup', () => requestAnimationFrame(sample), { once: true });
  });
}

async function settlingFrames(page: Page) {
  await page.waitForTimeout(800);
  return await page.evaluate(() => (window as unknown as { settling: { x: number, y: number, angle: number, targetShown: boolean }[] }).settling);
}

test.describe('Scene info panel', () => {
  test.beforeEach(async ({ request }) => {
    await setPanelConfig(request, {});
  });

  test.afterEach(async ({ request }) => {
    await setTvConfig(request, null);
  });

  for (const leftHandedUi of [false, true]) {
    test(`has an edit button in its top right corner, clear of the action buttons${leftHandedUi ? ' (left-handed)' : ''}`, async ({ page, request }) => {
      await setPanelConfig(request, { leftHandedUi });
      await openInfoPanel(page);

      const editButton = infoPanel(page).getByRole('button', { name: 'Customise info panel' });
      await expectUsableOnScreen(editButton);
      const panelBox = await box(infoPanel(page));
      const buttonBox = await box(editButton);
      expect(buttonBox.y - panelBox.y).toBeLessThan(buttonBox.height);
      expect(buttonBox.x + buttonBox.width / 2).toBeGreaterThan(panelBox.x + panelBox.width / 2);
    });
  }

  test('keeps its editor on screen in a short window', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await startEditing(page);

    await expectUsableOnScreen(infoPanel(page).getByRole('button', { name: 'Save' }));
    const lastAvailable = infoPanel(page).getByRole('button', { name: 'Add URLs' });
    await lastAvailable.scrollIntoViewIfNeeded();
    // Its controls' drag handle rather than the pill, whose rounded corners aren't part of it. The controls are over
    // its name, and take the pointer only while they're shown, when it's hovered over
    const lastAvailablePill = infoPanel(page).locator('.available-items .field-pill[data-field="urls"]');
    await lastAvailablePill.hover();
    await expectUsableOnScreen(lastAvailablePill.locator('.drag-handle'));
    // Scrolling the panel mustn't have scrolled the feed on to another video
    await expectUsableOnScreen(infoPanel(page).getByRole('button', { name: 'Save' }));
  });

  test('puts a field dragged onto a field on another line in its place, even drifting onto its right half', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['date'], ['performers']] });
    await startEditing(page);
    const [performers, date] = await Promise.all([box(pill(page, 'performers')), box(pill(page, 'date'))]);

    // Down and a little to the right, ending over the right half of the field below, but short of where it's pushed to
    // as the date takes its place (by about the date's width). Further right reads as moving back onto it after taking
    // its place, which swaps them.
    const x = performers.x + (performers.width / 2 + date.width) / 2;
    expect(x).toBeGreaterThan(performers.x + performers.width / 2);
    await dragTo(page, pill(page, 'date'), x, performers.y + performers.height / 2);

    await expect.poll(() => editorLayout(page)).toEqual([['date', 'performers']]);
  });

  test('puts a field after one on another line once dragged on past it to the right', async ({ page }) => {
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const y = title.y + title.height / 2;

    await startDrag(page, pill(page, 'date'), title.x + 6, y);
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['date', 'title'], ['performers'], []]);
    // Still over it, as it's been pushed along under the pointer, keeps the field in its place
    await page.mouse.move(title.x + title.width - 4, y, { steps: 5 });
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['date', 'title'], ['performers'], []]);
    await page.mouse.move(pastEnd(title), y, { steps: 5 });
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title', 'date'], ['performers'], []]);
    await page.mouse.up();

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title', 'date'], ['performers']]);
  });

  test('puts a field dragged onto the left half of another field to its left, on the same line', async ({ page }) => {
    await startEditing(page);
    const title = await box(pill(page, 'title'));

    await dragTo(page, pill(page, 'date'), title.x + 4, title.y + title.height / 2);

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['date', 'title'], ['performers']]);
  });

  test('puts a field dragged between two lines on a new line there, and saves the layout', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['title', 'date'], ['performers']] });
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const performers = await box(pill(page, 'performers'));

    await dragTo(page, pill(page, 'date'), title.x + 4, (title.y + title.height + performers.y) / 2);

    await expect.poll(() => editorLayout(page)).toEqual([['title'], ['date'], ['performers']]);
    await saveEdits(page);
    await expect(infoPanel(page).locator('.field-line')).toHaveText(['Grotto Glow', '14 February 2025', 'Bob Bold']);

    await page.reload();
    await currentSlide(page).getByRole('button', { name: 'Show scene info' }).click();
    await expect(infoPanel(page).locator('.field-line')).toHaveText(['Grotto Glow', '14 February 2025', 'Bob Bold']);
  });

  test('adds a field dragged in from the fields it isn\'t showing', async ({ page }) => {
    await startEditing(page);
    const title = await box(pill(page, 'title'));

    await dragTo(page, pill(page, 'tags'), pastEnd(title), title.y + title.height / 2);

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title', 'tags'], ['performers'], ['date']]);
  });

  test('shows a ghost of the field where it will go while it\'s dragged', async ({ page }) => {
    await startEditing(page);
    const title = await box(pill(page, 'title'));

    await startDrag(page, pill(page, 'date'), pastEnd(title), title.y + title.height / 2);

    // Its own line keeps its space, empty, until it's dropped
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title', 'date'], ['performers'], []]);
    await expect(infoPanel(page).locator('.layout-lines .field-pill.ghost')).toHaveCount(1);
    // Nothing is saved until it's dropped
    await page.mouse.up();
    await expect(infoPanel(page).locator('.field-pill.ghost')).toHaveCount(0);
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title', 'date'], ['performers']]);
  });

  test('drags a field grabbed by its remove button, without removing it', async ({ page }) => {
    await startEditing(page);
    const title = await box(pill(page, 'title'));

    await dragTo(page, pill(page, 'date').getByRole('button', { name: 'Remove Date' }), title.x + 4, title.y + title.height / 2);

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['date', 'title'], ['performers']]);
  });

  test('hides a field dragged down to the unused fields', async ({ page }) => {
    await startEditing(page);
    const unused = await box(infoPanel(page).locator('.available-items'));

    await dragTo(page, pill(page, 'performers'), unused.x + unused.width / 2, unused.y + unused.height / 2);

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['date']]);
    await expect(infoPanel(page).getByRole('button', { name: 'Add Performers' })).toBeVisible();
  });

  test('marks where a new line will go with a ghost line between the lines, without moving them', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['studio'], ['title', 'date'], ['performers']] });
    await startEditing(page);
    const fieldsAndSections = [pill(page, 'studio'), pill(page, 'title'), pill(page, 'performers'),
      infoPanel(page).locator('.layout-toolbar'), infoPanel(page).locator('.available-items')];
    const before = await Promise.all(fieldsAndSections.map(box));
    const [, titleBefore, performersBefore] = before;
    const date = await box(pill(page, 'date'));

    // Between the title's line and the performers'
    await startDrag(page, pill(page, 'date'), date.x + 8, (titleBefore.y + titleBefore.height + performersBefore.y) / 2);
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['performers']]);

    const ghostLine = await box(infoPanel(page).locator('.ghost-line'));
    expect(ghostLine.y).toBeGreaterThan(titleBefore.y + titleBefore.height);
    expect(ghostLine.y + ghostLine.height).toBeLessThan(performersBefore.y);
    // Lined up with the lines
    expect(ghostLine.x).toBeCloseTo(before[0].x, 0);
    // Nothing moves (but the date leaving the title's line)
    const after = await Promise.all(fieldsAndSections.map(box));
    after.forEach((afterBox, i) => expect(afterBox.y).toBeCloseTo(before[i].y, 0));

    await page.mouse.up();
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['date'], ['performers']]);
    await expect(infoPanel(page).locator('.ghost-line')).toHaveCount(0);
  });

  test('right-aligns a field dragged over the right third of the space after a line\'s fields, and saves it', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['title'], ['date']] });
    await startEditing(page);
    const lines = await box(infoPanel(page).locator('.layout-lines'));
    const title = await box(pill(page, 'title'));
    const y = title.y + title.height / 2;
    const space = { left: title.x + title.width, right: lines.x + lines.width };
    const intoSpace = (fraction: number) => space.left + (space.right - space.left) * fraction;
    const rightEdge = async (locator: Locator) => {
      const { x, width } = await box(locator);
      return x + width;
    };

    // Over the left two thirds of the space, it goes after the title
    await startDrag(page, pill(page, 'date'), intoSpace(0.5), y);
    await expect.poll(() => editorLayout(page)).toEqual([['title', 'date'], []]);
    await expect(rightAlignedPill(page, 'date')).toHaveCount(0);
    // Over the right third, it's right-aligned
    await page.mouse.move(intoSpace(0.85), y, { steps: 5 });
    await expect(rightAlignedPill(page, 'date')).toHaveCount(1);
    await expect.poll(() => rightEdge(pill(page, 'date'))).toBeCloseTo(space.right, 0);
    await page.mouse.up();

    await expect.poll(() => editorLayout(page)).toEqual([['title', 'date']]);
    await expect(rightAlignedPill(page, 'date')).toHaveCount(1);
    await saveEdits(page);
    const line = infoPanel(page).locator('.field-line');
    await expect(line).toHaveText(['Grotto Glow14 February 2025']);
    const rightAligned = line.locator('.right-aligned-fields');
    await expect(rightAligned).toHaveText('14 February 2025');
    expect(await rightEdge(rightAligned)).toBeCloseTo(await rightEdge(line), 0);

    await page.reload();
    await currentSlide(page).getByRole('button', { name: 'Show scene info' }).click();
    await expect(infoPanel(page).locator('.field-line .right-aligned-fields')).toHaveText('14 February 2025');
  });

  test('highlights the line a field is dragged onto, but not between lines', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['date'] }, ['performers'], ['tags']] });
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const date = await box(pill(page, 'date'));
    const performers = await box(pill(page, 'performers'));
    const highlighted = infoPanel(page).locator('.layout-line.target');

    await startDrag(page, pill(page, 'tags'), (title.x + title.width + date.x) / 2, title.y + title.height / 2);
    // The whole line, its right-aligned fields included
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted.locator('.field-pill')).toHaveText([/Title/, /Tags/, /Date/]);
    // Polled, as the highlight fades in (a transition), so just after it's added it can still be transparent
    await expect.poll(() => highlighted.evaluate((line) => getComputedStyle(line).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');

    await page.mouse.move(performers.x + 8, (title.y + title.height + performers.y) / 2, { steps: 5 });
    await expect(infoPanel(page).locator('.ghost-line')).toHaveCount(1);
    await expect(highlighted).toHaveCount(0);
    await page.mouse.up();
  });

  test('highlights the line the pointer\'s over while editing', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['date'] }, ['performers']] });
    await startEditing(page);
    const background = (line: Locator) => line.evaluate((element) => getComputedStyle(element).backgroundColor);
    const lines = infoPanel(page).locator('.layout-line');
    const title = await box(pill(page, 'title'));
    const date = await box(pill(page, 'date'));

    // In the space between the line's sides, not just over a pill
    await page.mouse.move((title.x + title.width + date.x) / 2, title.y + title.height / 2);
    await expect.poll(() => background(lines.nth(0))).not.toBe('rgba(0, 0, 0, 0)');
    expect(await background(lines.nth(1))).toBe('rgba(0, 0, 0, 0)');
    // 1em corners, like the pills'
    const { radius, em } = await lines.nth(0).evaluate((element) => ({
      radius: parseFloat(getComputedStyle(element).borderRadius),
      em: parseFloat(getComputedStyle(element).fontSize),
    }));
    expect(radius).toBeCloseTo(em, 1);
  });

  test('wraps a line\'s left fields and its right-aligned ones each on their own, the right-aligned rows on the right with a hanging indent, at least 2em from the left ones', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [{ left: ['title', 'performers', 'date'], right: ['duration', 'resolution', 'o-count'] }, ['studio']] });
    await page.setViewportSize({ width: 500, height: 800 });
    await startEditing(page);
    const lineBox = await box(infoPanel(page).locator('.layout-line').first());
    // A field alone on its line isn't squeezed by the left side's hanging indent
    expect(await pill(page, 'studio').locator('.pill-name').evaluate((name) => name.scrollWidth <= name.clientWidth)).toBe(true);

    const leftRows = await rowRightEdges(infoPanel(page).locator('.line-side.left .field-pill'));
    const rightRows = await rowRightEdges(infoPanel(page).locator('.line-side.right .field-pill'));
    expect(leftRows.length).toBeGreaterThan(1);
    expect(rightRows.length).toBeGreaterThan(1);
    // The right-aligned fields' first row ends at the line's right end, and their later rows are indented from it (a
    // hanging indent, mirroring the left side's), marked with a flipped wrap marker in the indent
    const lineEnd = lineBox.x + lineBox.width;
    expect(rightRows[0]).toBeCloseTo(lineEnd, 0);
    for (const right of rightRows.slice(1)) expect(right).toBeLessThan(lineEnd - 10);
    const rightMarker = await box(infoPanel(page).locator('.wrapped-line-marker.right'));
    expect(rightMarker.x).toBeGreaterThan(Math.max(...rightRows.slice(1)) - 1);
    expect(rightMarker.x + rightMarker.width).toBeCloseTo(lineEnd, 0);
    await expect(infoPanel(page).locator('.wrapped-line-marker.left')).toHaveCount(1);
    // Every left-aligned row at least 2em before the right-aligned fields
    const em = await infoPanel(page).locator('.layout-line').first().evaluate((line) => parseFloat(getComputedStyle(line).fontSize));
    const rightStart = (await box(infoPanel(page).locator('.line-side.right'))).x;
    for (const right of leftRows) expect(right).toBeLessThanOrEqual(rightStart - 2 * em + 0.5);

    // And the same in the panel itself
    await saveEdits(page);
    const line = infoPanel(page).locator('.field-line').first();
    const panelLine = await box(line);
    const panelRightRows = await rowRightEdges(line.locator('.right-aligned-fields > *'));
    expect(panelRightRows.length).toBeGreaterThan(1);
    for (const right of panelRightRows) expect(right).toBeCloseTo(panelLine.x + panelLine.width, 0);
    const panelEm = await line.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    const panelLeftEnd = Math.max(...await rowRightEdges(line.locator('.line-fields:not(.right-aligned-fields) > *')));
    expect(panelLeftEnd).toBeLessThanOrEqual((await box(line.locator('.right-aligned-fields'))).x - 2 * panelEm + 0.5);
  });

  test('right-aligns what\'s in right-aligned fields, and spaces tags by their list\'s gap alone', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['tags', 'performers'] }] });
    await openInfoPanel(page);
    const rightAligned = infoPanel(page).locator('.right-aligned-fields');

    expect(await rightAligned.evaluate((element) => getComputedStyle(element).textAlign)).toBe('right');
    const tags = infoPanel(page).locator('.field-tags .tag-item');
    expect(await tags.count()).toBeGreaterThan(0);
    for (const margin of await tags.evaluateAll((items) => items.map((item) => getComputedStyle(item).margin))) {
      expect(margin).toBe('0px');
    }
    // Ends at the line's end
    const tagsField = await box(infoPanel(page).locator('.field-tags'));
    const lastTag = await box(tags.last());
    expect(lastTag.x + lastTag.width).toBeCloseTo(tagsField.x + tagsField.width, 0);
  });

  test('lays a line\'s right-aligned fields out from its end, the first at the end', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['duration', 'resolution'] }] });
    await openInfoPanel(page);
    const panelField = (field: string) => box(infoPanel(page).locator(`.field-${field}`));
    expect((await panelField('duration')).x).toBeGreaterThan((await panelField('resolution')).x);

    await clickEdit(page);
    expect((await box(pill(page, 'duration'))).x).toBeGreaterThan((await box(pill(page, 'resolution'))).x);
  });

  test('moves a field along a line\'s right-aligned fields, which run from right to left', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['duration', 'resolution', 'date'] }] });
    await startEditing(page);
    const duration = await box(pill(page, 'duration'));
    const y = duration.y + duration.height / 2;

    // The last one (leftmost) dragged rightwards passes each field as soon as it's over it, as on the left heading the
    // other way: passing the first (at the line's end) puts it first
    await startDrag(page, pill(page, 'date'), duration.x + 6, y);
    await expect.poll(() => editorLayout(page)).toEqual([['title', 'date', 'duration', 'resolution']]);
    // Carrying on the same way keeps it there
    await page.mouse.move(duration.x + 20, y, { steps: 3 });
    await expect.poll(() => editorLayout(page)).toEqual([['title', 'date', 'duration', 'resolution']]);
    await page.mouse.up();

    await expect.poll(() => editorLayout(page)).toEqual([['title', 'date', 'duration', 'resolution']]);
    // Now first, so at the line's end
    const lines = await box(infoPanel(page).locator('.layout-lines'));
    await expect.poll(async () => {
      const date = await box(pill(page, 'date'));
      return date.x + date.width;
    }).toBeCloseTo(lines.x + lines.width, 0);
  });

  test('puts a field dropped on the right third of the space before a line\'s right-aligned fields beside them', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['duration'] }, ['date']] });
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const duration = await box(pill(page, 'duration'));
    const spaceLeft = title.x + title.width;

    await dragTo(page, pill(page, 'date'), spaceLeft + (duration.x - spaceLeft) * 0.85, title.y + title.height / 2);

    // After it in order, so left of it, beside the space
    await expect.poll(() => editorLayout(page)).toEqual([['title', 'duration', 'date']]);
    await expect(rightAlignedPill(page, 'date')).toHaveCount(1);
    await expect.poll(async () => (await box(pill(page, 'date'))).x).toBeLessThan((await box(pill(page, 'duration'))).x);
  });

  test('marks a new line with a ghost line across the half of the lines the field will be aligned to', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['title', 'date'], ['performers']] });
    await startEditing(page);
    const lines = await box(infoPanel(page).locator('.layout-lines'));
    const title = await box(pill(page, 'title'));
    const performers = await box(pill(page, 'performers'));
    const y = (title.y + title.height + performers.y) / 2;
    const ghostLine = infoPanel(page).locator('.ghost-line');

    await startDrag(page, pill(page, 'date'), lines.x + lines.width * 0.25, y);
    await expect.poll(async () => (await box(ghostLine)).x).toBeCloseTo(lines.x, 0);
    expect((await box(ghostLine)).width).toBeCloseTo(lines.width / 2, 0);

    await page.mouse.move(lines.x + lines.width * 0.75, y, { steps: 5 });
    await expect.poll(async () => (await box(ghostLine)).x).toBeCloseTo(lines.x + lines.width / 2, 0);
    expect((await box(ghostLine)).width).toBeCloseTo(lines.width / 2, 0);
    await page.mouse.up();

    await expect.poll(() => editorLayout(page)).toEqual([['title'], ['date'], ['performers']]);
    await expect(rightAlignedPill(page, 'date')).toHaveCount(1);
  });

  test('keeps the ghost dim for the whole drag', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['studio', 'title'], ['date'], ['performers']] });
    await startEditing(page);
    // Record the ghost's most opaque moment, every frame
    await page.evaluate(() => {
      const record = window as unknown as { maxGhostOpacity: number };
      record.maxGhostOpacity = 0;
      const sample = () => {
        for (const ghost of document.querySelectorAll('.field-pill.ghost')) {
          // As it looks: its opacity and any opacity filter
          const { opacity, filter } = getComputedStyle(ghost);
          const filterOpacity = Number(/opacity\(([\d.]+)\)/.exec(filter)?.[1] ?? 1);
          record.maxGhostOpacity = Math.max(record.maxGhostOpacity, Number(opacity) * filterOpacity);
        }
        requestAnimationFrame(sample);
      };
      sample();
    });
    const studio = await box(pill(page, 'studio'));
    const title = await box(pill(page, 'title'));

    // Across lines and along one, back and forth
    await startDrag(page, pill(page, 'performers'), studio.x + 4, studio.y + studio.height / 2);
    await page.mouse.move(title.x + title.width - 4, title.y + title.height / 2, { steps: 10 });
    await page.mouse.move(studio.x + 4, studio.y + studio.height / 2, { steps: 10 });
    await page.waitForTimeout(500);

    const maxOpacity = await page.evaluate(() => (window as unknown as { maxGhostOpacity: number }).maxGhostOpacity);
    expect(maxOpacity).toBeGreaterThan(0);
    expect(maxOpacity).toBeLessThan(0.5);
    await page.mouse.up();
  });

  test('keeps the space of the line a field is dragged off until it\'s dropped', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['studio'], ['date'], ['performers']] });
    await startEditing(page);
    const studio = await box(pill(page, 'studio'));
    const performersBefore = await box(pill(page, 'performers'));

    await startDrag(page, pill(page, 'date'), pastEnd(studio), studio.y + studio.height / 2);
    await expect.poll(() => editorLayout(page)).toEqual([['studio', 'date'], [], ['performers']]);
    await page.waitForTimeout(500); // Any sliding into place has finished

    expect((await box(pill(page, 'performers'))).y).toBeCloseTo(performersBefore.y, 0);
    await page.mouse.up();
    await expect.poll(() => editorLayout(page)).toEqual([['studio', 'date'], ['performers']]);
  });

  test('moves a lone field down into the next line without adding a line on the way', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['studio'], ['title'], ['performers']] });
    await startEditing(page);
    await page.evaluate(() => {
      const record = window as unknown as { maxLines: number };
      record.maxLines = 0;
      const sample = () => {
        const lines = new Set([...document.querySelectorAll<HTMLElement>('[data-current-video="true"] .SceneInfo.editing .layout-lines [data-line]')].map((item) => item.dataset.line));
        record.maxLines = Math.max(record.maxLines, lines.size);
        requestAnimationFrame(sample);
      };
      sample();
    });
    const title = await box(pill(page, 'title'));

    await startDrag(page, pill(page, 'studio'), pastEnd(title), title.y + title.height / 2);

    // Its own line stays, empty, until it's dropped
    await expect.poll(() => editorLayout(page)).toEqual([[], ['title', 'studio'], ['performers']]);
    expect(await page.evaluate(() => (window as unknown as { maxLines: number }).maxLines)).toBe(3);
    await page.mouse.up();
    await expect.poll(() => editorLayout(page)).toEqual([['title', 'studio'], ['performers']]);
  });

  test('moves a field past a longer one as soon as it\'s dragged onto it, and back once dragged back', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['date', 'performers']] });
    await startEditing(page);
    const performers = await box(pill(page, 'performers'));
    const y = performers.y + performers.height / 2;

    // Just onto the long field's left end
    await startDrag(page, pill(page, 'date'), performers.x + 6, y);
    await expect.poll(() => editorLayout(page)).toEqual([['performers', 'date']]);
    // Carrying on the same way over it keeps it there, though the pointer's still over the long field
    await page.mouse.move(performers.x + 12, y, { steps: 3 });
    await expect.poll(() => editorLayout(page)).toEqual([['performers', 'date']]);
    // Turning back over it moves it back
    await page.mouse.move(performers.x + 4, y, { steps: 3 });
    await expect.poll(() => editorLayout(page)).toEqual([['date', 'performers']]);
    await page.mouse.up();
  });

  test('keeps every field showing as a field dragged from the bottom is dropped at the top', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['studio'], ['title'], ['performers'], ['date']] });
    await startEditing(page);
    const studio = await box(pill(page, 'studio'));

    await startDrag(page, pill(page, 'date'), pastEnd(studio), studio.y + studio.height / 2);
    await expect.poll(() => editorLayout(page)).toEqual([['studio', 'date'], ['title'], ['performers'], []]);
    // Every frame from the drop: each field's pill is inside the panel, which hides what's outside it, and opaque
    await page.evaluate(() => {
      const record = window as unknown as { hidden: string[] };
      record.hidden = [];
      const started = performance.now();
      const sample = () => {
        const panel = document.querySelector('[data-current-video="true"] .SceneInfo.editing');
        if (!panel) return;
        const panelRect = panel.getBoundingClientRect();
        for (const pill of panel.querySelectorAll<HTMLElement>('.layout-lines .field-pill')) {
          const rect = pill.getBoundingClientRect();
          const opacity = Number(getComputedStyle(pill).opacity);
          if (rect.top < panelRect.top || rect.bottom > panelRect.bottom || opacity < 0.9) {
            record.hidden.push(`${pill.dataset.field} at ${Math.round(performance.now() - started)}ms`);
          }
        }
        if (performance.now() - started < 600) requestAnimationFrame(sample);
      };
      window.addEventListener('pointerup', () => requestAnimationFrame(sample), { once: true });
    });
    await page.mouse.up();
    await page.waitForTimeout(700);

    await expect.poll(() => editorLayout(page)).toEqual([['studio', 'date'], ['title'], ['performers']]);
    expect(await page.evaluate(() => (window as unknown as { hidden: string[] }).hidden)).toEqual([]);
  });

  test('slides the lines apart to make room for a new line once a field is dropped there', async ({ page, request }) => {
    // Enough lines to be taller than the unused fields beside them, so the panel grows with a new one
    await setPanelConfig(request, { sceneInfoLayout: [['studio'], ['title', 'date'], ['performers'], ['tags'], ['rating'], ['details']] });
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const performers = await box(pill(page, 'performers'));
    const date = await box(pill(page, 'date'));
    await startDrag(page, pill(page, 'date'), date.x + 8, (title.y + title.height + performers.y) / 2);
    await expect(infoPanel(page).locator('.ghost-line')).toHaveCount(1);

    await recordSlidingFields(page);
    await page.mouse.up();
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['date'], ['performers'], ['tags'], ['rating'], ['details']]);

    // The panel grows upwards, so the lines above the new one move up, and the toolbar with them. Side by side (the
    // screen's wider than it's tall) the unused fields move up too. The panel's background grows with them.
    expect(await slidFields(page)).toEqual(expect.arrayContaining(['studio', 'title', 'toolbar', 'unused fields', 'background']));
    // And ends up the panel's size
    const [panelBox, backgroundBox] = await Promise.all([box(infoPanel(page)), box(infoPanel(page).locator('.panel-background'))]);
    expect(backgroundBox.y).toBeCloseTo(panelBox.y, 0);
    expect(backgroundBox.height).toBeCloseTo(panelBox.height, 0);
  });

  test('slides a field and the ghost of one dragged onto it from the line above into their new places', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['date'], ['performers']] });
    await startEditing(page);
    const performers = await box(pill(page, 'performers'));
    await startDrag(page, pill(page, 'date'), performers.x + 4, performers.y - 12);

    await recordSlidingFields(page);
    await page.mouse.move(performers.x + 4, performers.y + performers.height / 2, { steps: 3 });
    await expect.poll(() => editorLayout(page)).toEqual([[], ['date', 'performers']]);

    expect(await slidFields(page)).toEqual(expect.arrayContaining(['date (ghost)', 'performers']));
    await page.mouse.up();
  });

  test('slides a field tapped in the unused fields into place in the lines', async ({ page }) => {
    await startEditing(page);
    await recordSlidingFields(page);

    await clickFieldControl(infoPanel(page).getByRole('button', { name: 'Add Tags' }));

    expect(await slidFields(page)).toContain('tags');
  });

  test('slides a removed field into the unused fields', async ({ page }) => {
    await startEditing(page);
    await recordSlidingFields(page);

    await clickFieldControl(infoPanel(page).getByRole('button', { name: 'Remove Title' }));

    expect(await slidFields(page)).toContain('title');
  });

  test('moves a field along a line that wraps onto another row without sending it to the end', async ({ page, request }) => {
    const fields = ['studio', 'title', 'performers', 'date', 'details', 'tags', 'groups', 'code', 'director', 'rating'];
    await setPanelConfig(request, { sceneInfoLayout: [fields] });
    await page.setViewportSize({ width: 500, height: 800 });
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    // It does wrap
    expect((await box(pill(page, 'rating'))).y).toBeGreaterThan(title.y + title.height);

    await startDrag(page, pill(page, 'studio'), title.x + 6, title.y + title.height / 2);
    await page.waitForTimeout(300);

    await expect.poll(() => editorLayout(page)).toEqual([['title', 'studio', ...fields.slice(2)]]);
    await page.mouse.up();
  });

  test('indents the later rows of a line that wraps', async ({ page, request }) => {
    const fields = ['studio', 'title', 'performers', 'date', 'details', 'tags', 'groups', 'code', 'director', 'rating'];
    await setPanelConfig(request, { sceneInfoLayout: [fields, ['urls']] });
    await page.setViewportSize({ width: 500, height: 800 });
    await startEditing(page);
    const firstRowStart = (await box(pill(page, 'studio'))).x;
    const wrappedRowStart = Math.min(...await infoPanel(page).locator('.layout-lines .field-pill').evaluateAll((pills) => {
      const first = pills[0].getBoundingClientRect();
      return pills
        .filter((pill) => pill.getBoundingClientRect().top > first.bottom && pill.getAttribute('data-line') === '0')
        .map((pill) => pill.getBoundingClientRect().left);
    }));

    expect(wrappedRowStart).toBeGreaterThan(firstRowStart + 10);
    // The next line isn't indented
    expect((await box(pill(page, 'urls'))).x).toBeCloseTo(firstRowStart, 0);
  });

  test('puts a field dragged onto a line\'s first field, then rightwards off it, between that field and the next', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['studio', 'title', 'performers'], ['date']] });
    await startEditing(page);
    const studio = await box(pill(page, 'studio'));
    const y = studio.y + studio.height / 2;

    await startDrag(page, pill(page, 'date'), studio.x + 6, y);
    await expect.poll(() => editorLayout(page)).toEqual([['date', 'studio', 'title', 'performers'], []]);
    // Across the field it took the place of (pushed along by its ghost) and off its far side
    await page.waitForTimeout(500); // It's finished sliding along
    const pushedStudio = await box(pill(page, 'studio'));
    await page.mouse.move(pushedStudio.x + pushedStudio.width + 3, y, { steps: 8 });

    await expect.poll(() => editorLayout(page)).toEqual([['studio', 'date', 'title', 'performers'], []]);
    await page.mouse.up();
  });

  test('grows upwards as fields are added, then scrolls once it reaches the top of the screen', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 700 });
    await startEditing(page);
    const before = await box(infoPanel(page));

    await clickFieldControl(infoPanel(page).getByRole('button', { name: 'Add Tags' }));
    const after = await box(infoPanel(page));
    expect(after.y + after.height).toBeCloseTo(before.y + before.height, 0);
    expect(after.y).toBeLessThan(before.y);

    for (const name of ['Details', 'Groups', 'Studio code', 'Director', 'Rating', 'Duration', 'Resolution', 'Play count', 'O-count', 'File path', 'URLs']) {
      await clickFieldControl(infoPanel(page).getByRole('button', { name: `Add ${name}` }));
    }
    const full = await box(infoPanel(page));
    expect(full.y).toBeGreaterThanOrEqual(0);
    expect(await infoPanel(page).locator('.panel-content').evaluate((content) => content.scrollHeight > content.clientHeight)).toBe(true);
  });

  test('shows the unused fields beside the fields on a screen wider than it is tall, and below them otherwise', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 600 });
    await startEditing(page);
    const lines = await box(infoPanel(page).locator('.layout-lines'));
    let unused = await box(infoPanel(page).locator('.available-items'));
    expect(unused.x).toBeGreaterThanOrEqual(lines.x + lines.width);

    await page.setViewportSize({ width: 600, height: 1000 });
    await expect.poll(async () => (await box(infoPanel(page).locator('.available-items'))).y)
      .toBeGreaterThanOrEqual((await box(infoPanel(page).locator('.layout-lines'))).y + 10);
    unused = await box(infoPanel(page).locator('.available-items'));
    expect(unused.x).toBeLessThan(lines.x + 20);
  });

  test('swaps a field with the one whose place it took as soon as it\'s dragged back onto it', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['date'], ['performers']] });
    await startEditing(page);
    const date = await box(pill(page, 'date'));
    const y = date.y + date.height / 2;

    // Up onto the left of the field above, which the ghost pushes out from under the pointer
    await startDrag(page, pill(page, 'performers'), date.x + 6, y);
    await expect.poll(() => editorLayout(page)).toEqual([['performers', 'date'], []]);
    await page.waitForTimeout(500); // It's finished sliding along

    // Back onto it, rightwards
    const pushedDate = await box(pill(page, 'date'));
    await page.mouse.move(pushedDate.x + 6, y, { steps: 5 });

    await expect.poll(() => editorLayout(page)).toEqual([['date', 'performers'], []]);
    await page.mouse.up();
  });

  test('moves a field between the rows of a line that wraps as if they were lines of their own', async ({ page, request }) => {
    const fields = ['studio', 'title', 'performers', 'date', 'details', 'tags', 'groups', 'code', 'director', 'rating', 'duration'];
    await setPanelConfig(request, { sceneInfoLayout: [fields] });
    await page.setViewportSize({ width: 460, height: 800 });
    await startEditing(page);
    // A width at which, without the dragged field, the first row would still have no room for the next row's first
    // field: otherwise it moves up as the dragged field leaves, putting another field under the pointer (see
    // docs/line-layout-editor.md § "Moving items"). Tried on a copy of the line's left side without it.
    await resizeUntil(page, widthsBetween(400, 700), 800, () => infoPanel(page).locator('.layout-line .line-side.left').first().evaluate((side) => {
      const rows = (element: Element) => [...element.children].reduce<number[][]>((found, pill) => {
        const top = (pill as HTMLElement).offsetTop;
        const row = found.find((tops) => Math.abs(tops[0] - top) < 4);
        if (row) row.push(top); else found.push([top]);
        return found;
      }, []);
      if (rows(side).length < 2) return false;
      const copy = side.cloneNode(true) as HTMLElement;
      copy.style.cssText = `position: absolute; visibility: hidden; width: ${side.getBoundingClientRect().width}px; box-sizing: border-box`;
      copy.querySelector('[data-field="title"]')?.remove();
      side.parentElement!.append(copy);
      const firstRowWithout = rows(copy)[0].length;
      copy.remove();
      return firstRowWithout === rows(side)[0].length - 1;
    }));
    const dragged = await box(pill(page, 'title'));
    // The field straight below it, on the line's next row
    const x = dragged.x + dragged.width / 2;
    const below = await infoPanel(page).locator('.layout-lines .field-pill').evaluateAll((pills, { x, draggedBottom }) => {
      const top = (pill: Element) => pill.getBoundingClientRect().top;
      const nextRowTop = Math.min(...pills.map(top).filter((pillTop) => pillTop > draggedBottom));
      return pills.find((pill) => {
        const rect = pill.getBoundingClientRect();
        return rect.top === nextRowTop && rect.left <= x && rect.right >= x;
      })?.getAttribute('data-field');
    }, { x, draggedBottom: dragged.y + dragged.height });
    if (!below) throw new Error('No field straight below on the next row');
    const target = await box(pill(page, below));

    // Straight down onto it
    await startDrag(page, pill(page, 'title'), x, target.y + target.height / 2);

    // After it: taking 'title' from before it moves it back, so that's roughly where it was
    const expected = fields.filter((field) => field !== 'title');
    expected.splice(expected.indexOf(below) + 1, 0, 'title');
    await expect.poll(() => editorLayout(page)).toEqual([expected]);
    await page.mouse.up();
    await expect.poll(() => editorLayout(page)).toEqual([expected]);
  });

  test('marks each line that wraps once, in the indent of its later rows', async ({ page, request }) => {
    const fields = ['studio', 'title', 'performers', 'date', 'details', 'tags', 'groups', 'code', 'director', 'rating', 'duration'];
    await setPanelConfig(request, { sceneInfoLayout: [fields, ['urls'], ['path', 'o-count']] });
    // Narrow enough for the first line to wrap onto three rows
    await page.setViewportSize({ width: 450, height: 800 });
    await startEditing(page);

    const markers = infoPanel(page).locator('.wrapped-line-marker');
    await expect(markers).toHaveCount(1);
    const marker = await box(markers);
    const studio = await box(pill(page, 'studio'));
    const laterRows = await infoPanel(page).locator('.layout-lines .field-pill[data-line="0"]').evaluateAll((pills, firstRowBottom) => {
      const rects = pills.map((pill) => pill.getBoundingClientRect()).filter((rect) => rect.top > firstRowBottom);
      return { top: Math.min(...rects.map((rect) => rect.top)), bottom: Math.max(...rects.map((rect) => rect.bottom)), left: Math.min(...rects.map((rect) => rect.left)), rows: new Set(rects.map((rect) => rect.top)).size };
    }, studio.y + studio.height);
    expect(laterRows.rows).toBeGreaterThan(1);
    // Centred across the later rows, in their indent
    expect(marker.y + marker.height / 2).toBeCloseTo((laterRows.top + laterRows.bottom) / 2, 0);
    expect(marker.x).toBeGreaterThanOrEqual(studio.x - 1);
    expect(marker.x + marker.width).toBeLessThanOrEqual(laterRows.left + 1);
  });

  test('settles a field dragged from the first row of a wrapped line onto its last, rather than moving it back and forth', async ({ page, request }) => {
    // [studio] [title] [performers] [date]
    //   [tags]
    const fields = ['studio', 'title', 'performers', 'date', 'tags'];
    await setPanelConfig(request, { sceneInfoLayout: [fields] });
    // Taller than it's wide throughout, so the unused fields stay below the lines
    await page.setViewportSize({ width: 900, height: 1400 });
    await startEditing(page);
    const slack = await infoPanel(page).locator('.layout-lines').evaluate((container) => {
      const date = container.querySelector<HTMLElement>('.field-pill[data-field="date"]')!;
      return container.getBoundingClientRect().right - date.getBoundingClientRect().right;
    });
    await page.setViewportSize({ width: Math.floor(900 - slack + 4), height: 1400 });
    const tags = await box(pill(page, 'tags'));
    const date = await box(pill(page, 'date'));
    expect(tags.y).toBeGreaterThan(date.y + date.height);

    // The second field down onto the one wrapped onto the second row, which, once the dragged field's out of the first
    // row, fits back on it
    await startDrag(page, pill(page, 'title'), tags.x + tags.width / 2, tags.y + tags.height / 2);
    await page.waitForTimeout(500);

    const settled = await layoutsOverTime(page);
    expect(settled).toEqual([JSON.stringify([['studio', 'performers', 'date', 'tags', 'title']])]);
    await page.mouse.up();
  });

  test('marks where a field dragged onto a line it would make wrap will go, and only wraps it once it\'s dropped', async ({ page, request }) => {
    const full = ['title', 'performers', 'date', 'tags'];
    await setPanelConfig(request, { sceneInfoLayout: [['studio'], full] });
    // Taller than it's wide throughout, so the unused fields stay below the lines
    await page.setViewportSize({ width: 900, height: 1400 });
    await startEditing(page);
    // Narrow the window until the second line only just fits on one row
    const slack = await infoPanel(page).locator('.layout-lines').evaluate((container) => {
      const pills = [...container.querySelectorAll<HTMLElement>('.field-pill[data-line="1"]')];
      return container.getBoundingClientRect().right - Math.max(...pills.map((pill) => pill.getBoundingClientRect().right));
    });
    await page.setViewportSize({ width: Math.floor(900 - slack + 4), height: 1400 });
    const title = await box(pill(page, 'title'));
    const performers = await box(pill(page, 'performers'));
    const tags = await box(pill(page, 'tags'));
    expect(tags.y).toBeCloseTo(title.y, 0);

    // Onto the line's second field
    await startDrag(page, pill(page, 'studio'), performers.x + 6, performers.y + performers.height / 2);
    await page.waitForTimeout(500);

    // No ghost on the line, which doesn't wrap and doesn't move about, but a line just before the second field
    const settled = await layoutsOverTime(page);
    expect(settled).toEqual([JSON.stringify([[], full])]);
    expect((await box(pill(page, 'tags'))).y).toBeCloseTo(tags.y, 0);
    const insertionLine = await box(infoPanel(page).locator('.insertion-line'));
    expect(insertionLine.x).toBeGreaterThan(title.x + title.width - 1);
    expect(insertionLine.x + insertionLine.width).toBeLessThan(performers.x + 1);

    await page.mouse.up();
    await expect.poll(() => editorLayout(page)).toEqual([['title', 'studio', 'performers', 'date', 'tags']]);
    await page.waitForTimeout(500); // Finished sliding into place (the panel grows upwards, so everything's moved)
    const titleAfter = await box(pill(page, 'title'));
    expect((await box(pill(page, 'tags'))).y).toBeGreaterThan(titleAfter.y + titleAfter.height);
  });

  test('doesn\'t shrink the unused fields while a field is dragged out of them, so nothing above moves', async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 1000 });
    await startEditing(page);
    // A width at which the URLs are alone on the unused fields' last row
    await resizeUntil(page, widthsBetween(400, 900), 1000, async () => (
      (await box(pill(page, 'urls'))).y > (await box(pill(page, 'path'))).y + 1
    ));
    const unused = infoPanel(page).locator('.available-items');
    const [unusedBefore, studioBefore] = await Promise.all([box(unused), box(pill(page, 'studio'))]);
    const title = await box(pill(page, 'title'));

    await startDrag(page, pill(page, 'urls'), pastEnd(title), title.y + title.height / 2);
    await page.waitForTimeout(500);

    const unusedDuring = await box(unused);
    expect(unusedDuring.height).toBeCloseTo(unusedBefore.height, 0);
    expect((await box(pill(page, 'studio'))).y).toBeCloseTo(studioBefore.y, 0);
    await page.mouse.up();
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title', 'urls'], ['performers'], ['date']]);
  });

  test('grows upwards, not downwards, as the unused fields take a field\'s ghost', async ({ page }) => {
    await page.setViewportSize({ width: 750, height: 1000 });
    await startEditing(page);
    // A width at which the unused fields' last row has no room for another (the performers, which will be dragged there)
    await resizeUntil(page, widthsBetween(400, 900), 1000, () => infoPanel(page).locator('.available-item-list').evaluate((list) => {
      const pills = [...list.children] as HTMLElement[];
      const last = pills.at(-1)!.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const performers = list.closest('.SceneInfo')!.querySelector('.layout-lines .field-pill[data-field="performers"]')!;
      return list.getBoundingClientRect().right - last.right < gap + performers.getBoundingClientRect().width;
    }));
    const panelBottom = async () => { const panel = await box(infoPanel(page)); return panel.y + panel.height; };
    const bottomBefore = await panelBottom();
    const unusedBefore = await box(infoPanel(page).locator('.available-items'));

    const unused = await box(infoPanel(page).locator('.available-items'));
    await startDrag(page, pill(page, 'performers'), unused.x + unused.width / 2, unused.y + unused.height - 6);
    await page.waitForTimeout(500);

    // The unused fields have grown to take it, and the panel's bottom hasn't moved
    expect((await box(infoPanel(page).locator('.available-items'))).height).toBeGreaterThan(unusedBefore.height);
    expect(await panelBottom()).toBeCloseTo(bottomBefore, 0);
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(await panelBottom()).toBeCloseTo(bottomBefore, 0);
  });

  test('shows the ghost of a field dragged to the unused fields in its usual place among them', async ({ page }) => {
    await startEditing(page);
    const unused = await box(infoPanel(page).locator('.available-items'));

    await startDrag(page, pill(page, 'title'), unused.x + unused.width / 2, unused.y + unused.height - 6);

    // Fields are listed in their usual order, which has the title before the details
    const listed = infoPanel(page).locator('.available-item-list > .field-pill');
    await expect(listed.first()).toHaveClass(/ghost/);
    await expect(listed.first()).toHaveAttribute('data-field', 'title');
    await page.mouse.up();
    await expect(infoPanel(page).getByRole('button', { name: 'Add Title' })).toBeVisible();
  });

  test('doesn\'t slide the fields in when moving to the next video while editing', async ({ page }) => {
    await startEditing(page);
    await page.waitForTimeout(500); // The panel's finished growing into the editor
    await recordSlidingFields(page);

    await page.keyboard.press('ArrowDown');
    await expect(infoPanel(page).getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(currentSlide(page)).not.toHaveAttribute('data-scene-id', 'scene-7');

    expect(await slidFields(page)).toEqual([]);
  });

  test('names a field with no value for the scene when showing values', async ({ page }) => {
    await startEditing(page);
    await infoPanel(page).getByRole('button', { name: 'Field value' }).click();
    await morphDone(page);

    // The first scene has no studio
    const studioValue = pill(page, 'studio').locator('.pill-value');
    expect(await studioValue.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"No studio"');
    expect(await studioValue.evaluate((el) => getComputedStyle(el, '::before').opacity)).toBe('0.6');
  });

  // Steps through the room left on the line's last row, from none to more than the field needs
  const WRAP_SWEEP_STEPS = Number(process.env.WRAP_SWEEP_STEPS ?? 4);
  for (const rowsBefore of [1, 2]) {
    for (const from of ['another line', 'the unused fields'] as const) {
      test(`shows an insertion line, not the ghost, only when a field from ${from} would make a line of ${rowsBefore} row${rowsBefore > 1 ? 's' : ''} take another, whatever room is left`, async ({ page, request }) => {
        test.setTimeout(240_000);
        const target = rowsBefore === 1 ? ['title', 'performers', 'date'] : ['title', 'performers', 'date', 'tags', 'groups', 'code', 'director'];
        const layout = from === 'another line' ? [['studio'], target] : [target];
        const dragged = from === 'another line' ? 'studio' : 'resolution';
        const targetLine = from === 'another line' ? 1 : 0;
        // Taller than it's wide throughout, so the unused fields stay below the lines
        const height = 1400;
        const rowsOf = async (line: number) => await infoPanel(page).locator(`.layout-lines .field-pill[data-line="${line}"]:not(.ghost)`)
          .evaluateAll((pills) => new Set(pills.map((pill) => Math.round(pill.getBoundingClientRect().top))).size);

        // Find the narrowest width at which the line takes `rowsBefore` rows (as little room left on its last row as
        // there can be)
        await setPanelConfig(request, { sceneInfoLayout: layout });
        await page.setViewportSize({ width: 900, height });
        await startEditing(page);
        const draggedWidth = (await box(pill(page, dragged))).width + 20; // As it is on a line, with its ×
        let width = 900;
        while (await rowsOf(targetLine) < rowsBefore) {
          width -= 10;
          await page.setViewportSize({ width, height });
        }
        while (await rowsOf(targetLine) > rowsBefore) {
          width += 1;
          await page.setViewportSize({ width, height });
        }

        const results: string[] = [];
        for (let step = 0; step <= WRAP_SWEEP_STEPS; step++) {
          const extra = Math.round(draggedWidth * step / WRAP_SWEEP_STEPS);
          for (const onto of ['first', 'last'] as const) {
            await setPanelConfig(request, { sceneInfoLayout: layout });
            await page.setViewportSize({ width: width + extra, height });
            await startEditing(page);
            const before = await rowsOf(targetLine);
            if (before !== rowsBefore) continue;
            const field = await box(pill(page, onto === 'first' ? target[0] : target[target.length - 1]));
            await startDrag(page, pill(page, dragged), field.x + 6, field.y + field.height / 2);
            await page.waitForTimeout(500);
            const settled = await layoutsOverTime(page, 600);
            const ghostOnLine = await infoPanel(page).locator('.layout-lines .field-pill.ghost').count();
            const insertionLine = await infoPanel(page).locator('.insertion-line').count();
            await page.mouse.up();
            await page.waitForTimeout(400);
            const after = await rowsOf(0);
            const wraps = after > before;
            const ok = settled.length === 1 && (wraps ? insertionLine === 1 && ghostOnLine === 0 : insertionLine === 0 && ghostOnLine === 1);
            if (!ok) results.push(`+${extra}px onto ${onto}: ${before}→${after} rows, ${settled.length} layouts, ghost ${ghostOnLine}, insertion line ${insertionLine}`);
          }
        }
        expect(results).toEqual([]);
      });
    }
  }

  test('doesn\'t move the lines while a long field is dragged over a full line, showing values', async ({ page, request }) => {
    test.setTimeout(120_000);
    // A line whose two sides both wrap, with long values that shrink and wrap their text, and a long description below
    await setPanelConfig(request, {
      // So the video doesn't end, moving the feed on to the next one, mid-drag
      looping: true,
      sceneInfoLayout: [
        { left: ['studio', 'title', 'performers', 'date', 'tags', 'groups', 'path', 'urls'], right: ['rating', 'duration', 'resolution', 'play-count', 'o-count', 'code', 'director'] },
        ['details'],
      ],
    });
    // A width at which there's somewhere on the line the field fits without moving anything (see below)
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/');
    const id = await currentSlide(page).getAttribute('data-scene-id');
    const sceneQuery = 'query ($id: ID!) { findScene(id: $id) { details urls } }';
    const original = (await graphql(request, sceneQuery, { id })).findScene;
    const updateScene = (input: Record<string, unknown>) => graphql(
      request, 'mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }', { input: { id, ...input } },
    );
    try {
      await updateScene({
        urls: [`https://example.com/scenes/${'a-very-long-slug-'.repeat(6)}`, `https://example.org/videos/${'y'.repeat(60)}`],
        details: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      });
      await page.reload();
      await startEditing(page);
      await infoPanel(page).getByRole('button', { name: 'Field value' }).click();
      await morphDone(page);
      await page.waitForTimeout(500);
      const lines = infoPanel(page).locator('.layout-lines > .layout-line');
      const linesBox = await box(infoPanel(page).locator('.layout-lines'));
      const fullLine = await box(lines.first());

      const details = await box(pill(page, 'details'));
      await page.mouse.move(details.x + 10, details.y + details.height / 2);
      await page.mouse.down();
      const moved: string[] = [];
      let ghostShown = false;
      for (const fy of [0.1, 0.5, 0.9]) {
        for (let fx = 0.05; fx < 1; fx += 0.15) {
          await page.mouse.move(linesBox.x + linesBox.width * fx, fullLine.y + fullLine.height * fy, { steps: 5 });
          await page.waitForTimeout(300);
          ghostShown ||= await infoPanel(page).locator('.layout-lines .field-pill.ghost').count() > 0;
          const [line, next] = await Promise.all([box(lines.nth(0)), box(lines.nth(1))]);
          if (Math.abs(line.height - fullLine.height) > 1 || Math.abs(next.y - (fullLine.y + fullLine.height)) > 20) {
            moved.push(`at ${fx.toFixed(2)}, ${fy}: line ${fullLine.height}→${line.height}px high`);
          }
        }
      }
      await page.mouse.up();
      expect(moved).toEqual([]);
      // Where it fits without moving anything, it still shows its ghost
      expect(ghostShown).toBe(true);
    } finally {
      await updateScene(original);
    }
  });

  test('slides the marker of a wrapped line along with its rows', async ({ page, request }) => {
    const wrapping = ['studio', 'title', 'performers', 'date', 'details', 'tags', 'groups', 'code', 'director', 'rating', 'duration'];
    await setPanelConfig(request, { sceneInfoLayout: [wrapping, ['urls', 'path'], ['o-count']] });
    await page.setViewportSize({ width: 500, height: 1000 });
    await startEditing(page);
    await expect(infoPanel(page).locator('.wrapped-line-marker')).toHaveCount(1);
    const path = await box(pill(page, 'path'));
    const oCount = await box(pill(page, 'o-count'));
    await startDrag(page, pill(page, 'path'), path.x + 8, (path.y + path.height + oCount.y) / 2);
    await expect(infoPanel(page).locator('.ghost-line')).toHaveCount(1);

    await recordSlidingFields(page);
    await page.mouse.up();

    // The new line makes the panel grow upwards, moving the wrapped line up
    expect(await slidFields(page)).toEqual(expect.arrayContaining(['studio', 'wrapped line marker']));
  });

  test('doesn\'t clip the toolbar as it slides down when the panel shrinks', async ({ page, request }) => {
    // Nearly every field in the lines, so the unused fields have room for the one removed
    await setPanelConfig(request, { sceneInfoLayout: [
      ['studio', 'title', 'performers'], ['date', 'details', 'tags'], ['groups', 'code', 'director'],
      ['rating', 'duration', 'resolution'], ['play-count', 'path'], ['o-count'],
    ] });
    // The unused fields below the lines, so the panel shrinks by the whole line
    await page.setViewportSize({ width: 600, height: 1000 });
    await startEditing(page);
    await page.waitForTimeout(500);
    const panelBefore = await box(infoPanel(page));
    // Every frame from the click: whether the toolbar is outside the panel's contents while they clip what's outside them
    await page.evaluate(() => {
      const record = window as unknown as { clipped: number, frames: number };
      record.clipped = 0;
      record.frames = 0;
      const started = performance.now();
      const sample = () => {
        const panel = document.querySelector('[data-current-video="true"] .SceneInfo.editing');
        const content = panel?.querySelector<HTMLElement>('.panel-content');
        const toolbar = panel?.querySelector<HTMLElement>('.layout-toolbar');
        if (content && toolbar) {
          record.frames++;
          const contentRect = content.getBoundingClientRect();
          const toolbarRect = toolbar.getBoundingClientRect();
          const clips = getComputedStyle(content).overflowY !== 'visible';
          if (clips && (toolbarRect.top < contentRect.top - 1 || toolbarRect.bottom > contentRect.bottom + 1)) record.clipped++;
        }
        if (performance.now() - started < 600) requestAnimationFrame(sample);
      };
      window.addEventListener('click', () => requestAnimationFrame(sample), { once: true, capture: true });
    });

    // Removing the o-count removes its line
    await clickFieldControl(infoPanel(page).getByRole('button', { name: 'Remove O-count' }));
    await page.waitForTimeout(700);

    expect((await box(infoPanel(page))).height).toBeLessThan(panelBefore.height - 10);
    const { clipped, frames } = await page.evaluate(() => {
      const { clipped, frames } = window as unknown as { clipped: number, frames: number };
      return { clipped, frames };
    });
    expect(frames).toBeGreaterThan(5);
    expect(clipped).toBe(0);
  });

  test('reaches the bottom of the screen while editing, over the video\'s progress bar', async ({ page }) => {
    await startEditing(page);
    const viewport = page.viewportSize()!;

    const panel = await box(infoPanel(page));
    expect(panel.y + panel.height).toBeCloseTo(viewport.height, 0);
    const progressBarCovered = await currentSlide(page).locator('.vjs-progress-control').evaluate((progress) => {
      const rect = progress.getBoundingClientRect();
      return !!document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.SceneInfo');
    });
    expect(progressBarCovered).toBe(true);
    // The action buttons are still over it
    await expectUsableOnScreen(currentSlide(page).getByRole('button', { name: 'Close scene info' }));
  });

  /** @see docs/scene-info-panel.md § "Switching to and from editing" */
  test('morphs its fields into their pills as editing starts, and back once it ends, without wrapping their text', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['title'], ['date']] });
    await openInfoPanel(page);
    // Every frame of the morph: whether it's going, and any copy of a field or pill whose text has wrapped
    await page.evaluate(() => {
      const record = window as unknown as { morphFrames: number, wrapped: Set<string> };
      record.morphFrames = 0;
      record.wrapped = new Set();
      const sample = () => {
        const layer = document.querySelector('[data-current-video="true"] .morph-layer');
        if (layer) {
          record.morphFrames++;
          for (const copy of layer.querySelectorAll<HTMLElement>('.field, .field-pill')) {
            if (copy.scrollHeight > copy.clientHeight + 1) record.wrapped.add(copy.className);
          }
        }
        requestAnimationFrame(sample);
      };
      sample();
    });

    await clickEdit(page);
    await saveEdits(page);

    const { morphFrames, wrapped } = await page.evaluate(() => {
      const { morphFrames, wrapped } = window as unknown as { morphFrames: number, wrapped: Set<string> };
      return { morphFrames, wrapped: [...wrapped] };
    });
    expect(morphFrames).toBeGreaterThan(10);
    expect(wrapped).toEqual([]);
    await expect(infoPanel(page).locator('.field-date')).toHaveText('14 February 2025');
  });

  /** @see docs/scene-info-panel.md § "Switching to and from editing" */
  test('fades the unused fields in with the editor as editing starts, not faded twice over', async ({ page }) => {
    await openInfoPanel(page);
    // Every frame of the morph: the unused fields' own opacity, apart from the editor's they're in, and whether the
    // panel's translucent background's copy is over them, dimming them until the morph ended
    await page.evaluate(() => {
      const record = window as unknown as { ownOpacities: number[], coveredBy: Set<string> };
      record.ownOpacities = [];
      record.coveredBy = new Set();
      const sample = () => {
        const panel = document.querySelector('[data-current-video="true"] .SceneInfo');
        const layer = panel?.querySelector('.morph-layer');
        if (panel && layer) {
          for (const pill of panel.querySelectorAll('.available-items .field-pill')) {
            record.ownOpacities.push(Number(getComputedStyle(pill).opacity));
          }
          const unused = panel.querySelector('.available-items')!.getBoundingClientRect();
          for (const copy of layer.querySelectorAll<HTMLElement>('[data-morph-frame]')) {
            const rect = copy.getBoundingClientRect();
            const overlaps = rect.left < unused.right && rect.right > unused.left && rect.top < unused.bottom && rect.bottom > unused.top;
            if (overlaps) record.coveredBy.add(copy.className);
          }
        }
        requestAnimationFrame(sample);
      };
      sample();
    });

    await clickEdit(page);

    const { ownOpacities, coveredBy } = await page.evaluate(() => {
      const { ownOpacities, coveredBy } = window as unknown as { ownOpacities: number[], coveredBy: Set<string> };
      return { ownOpacities, coveredBy: [...coveredBy] };
    });
    expect(ownOpacities.length).toBeGreaterThan(10);
    expect(ownOpacities.every((opacity) => opacity === 1)).toBe(true);
    expect(coveredBy).toEqual([]);
  });

  /** @see docs/scene-info-panel.md § "Switching to and from editing" */
  test('morphs the pills between names and values, without wrapping their text', async ({ page }) => {
    await startEditing(page);
    await page.evaluate(() => {
      const record = window as unknown as { morphFrames: number, wrapped: Set<string> };
      record.morphFrames = 0;
      record.wrapped = new Set();
      const sample = () => {
        const layer = document.querySelector('[data-current-video="true"] .morph-layer');
        if (layer) {
          record.morphFrames++;
          for (const copy of layer.querySelectorAll<HTMLElement>('.field-pill')) {
            if (copy.scrollHeight > copy.clientHeight + 1) record.wrapped.add(copy.dataset.field ?? '');
          }
        }
        requestAnimationFrame(sample);
      };
      sample();
    });

    await infoPanel(page).getByRole('button', { name: 'Field value' }).click();

    await morphDone(page);
    await morphDone(page);

    const { morphFrames, wrapped } = await page.evaluate(() => {
      const { morphFrames, wrapped } = window as unknown as { morphFrames: number, wrapped: Set<string> };
      return { morphFrames, wrapped: [...wrapped] };
    });
    expect(morphFrames).toBeGreaterThan(10);
    expect(wrapped).toEqual([]);
    await expect(pill(page, 'date')).toHaveText('14 February 2025');
  });

  test('switches to and from editing at once when the user prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openInfoPanel(page);
    await infoPanel(page).getByRole('button', { name: 'Customise info panel' }).click();

    await expect(pill(page, 'title')).toBeVisible();
    expect(await infoPanel(page).locator('.morph-layer').count()).toBe(0);
  });

  test('shows a field\'s controls over it while it\'s hovered over, but not while it\'s dragged', async ({ page }) => {
    await startEditing(page);
    const controls = pill(page, 'title').locator('.item-controls');
    const opacity = () => controls.evaluate((element) => Number(getComputedStyle(element).opacity));
    expect(await opacity()).toBe(0);

    await pill(page, 'title').hover();
    await expect.poll(opacity).toBe(1);
    // Over the field, not beside it
    const [pillBox, controlsBox] = await Promise.all([box(pill(page, 'title')), box(controls)]);
    expect(controlsBox).toEqual(pillBox);
    await expect(pill(page, 'title').getByRole('button', { name: 'Remove Title' })).toBeVisible();

    const performers = await box(pill(page, 'performers'));
    await startDrag(page, pill(page, 'title'), performers.x + 4, performers.y + performers.height / 2);
    await expect(infoPanel(page).locator('.item-controls:visible')).toHaveCount(0);
    await page.mouse.up();
  });

  test('offers to add an unused field with its controls\' + rather than a ×', async ({ page }) => {
    await startEditing(page);
    const tags = infoPanel(page).locator('.available-items .field-pill[data-field="tags"]');

    await tags.hover();
    await expect(tags.getByRole('button', { name: 'Remove Tags' })).toHaveCount(0);
    await tags.getByRole('button', { name: 'Add Tags' }).click();

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['performers'], ['date'], ['tags']]);
  });

  test('slides a field let go where it can\'t go back to where it came from, straightening as it goes', async ({ page }) => {
    await startEditing(page);
    const date = await box(pill(page, 'date'));
    const panel = await box(infoPanel(page));

    // Above the panel, over the video
    await startDrag(page, pill(page, 'date'), date.x + 8, panel.y - 40);
    await recordSettling(page);
    await page.mouse.up();
    const frames = await settlingFrames(page);

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['performers'], ['date']]);
    expect(frames.length).toBeGreaterThan(5);
    // From where it was let go, tilted, to where it was, straight
    expect(frames[0].y).toBeLessThan(panel.y);
    expect(Math.abs(frames[0].angle)).toBeGreaterThan(1);
    const last = frames.at(-1)!;
    expect(last.x).toBeCloseTo(date.x + date.width / 2, -1);
    expect(last.y).toBeCloseTo(date.y + date.height / 2, -1);
    expect(Math.abs(last.angle)).toBeLessThan(0.5);
    // The field itself only shows once its copy gets there
    expect(frames.every((frame) => !frame.targetShown)).toBe(true);
    await expect(pill(page, 'date')).toBeVisible();
  });

  test('slides a field dropped on a line into its new place rather than jumping there', async ({ page }) => {
    await startEditing(page);
    const title = await box(pill(page, 'title'));

    await startDrag(page, pill(page, 'date'), pastEnd(title), title.y + title.height / 2);
    await recordSettling(page);
    await page.mouse.up();
    const frames = await settlingFrames(page);

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title', 'date'], ['performers']]);
    const date = await box(pill(page, 'date'));
    expect(frames.length).toBeGreaterThan(5);
    expect(frames[0].x).toBeGreaterThan(date.x + date.width);
    const last = frames.at(-1)!;
    expect(last.x).toBeCloseTo(date.x + date.width / 2, -1);
    expect(last.y).toBeCloseTo(date.y + date.height / 2, -1);
    expect(Math.abs(last.angle)).toBeLessThan(0.5);
  });

  for (const orientation of ['below', 'beside'] as const) {
    test(`spaces the toolbar, the lines and the unused fields evenly with the unused fields ${orientation} the lines`, async ({ page }) => {
      await page.setViewportSize(orientation === 'below' ? { width: 600, height: 1000 } : { width: 1280, height: 720 });
      await startEditing(page);
      const [toolbar, lines, unused] = await Promise.all(['.layout-toolbar', '.layout-lines', '.available-items']
        .map((selector) => box(infoPanel(page).locator(selector))));
      const gapBelowToolbar = lines.y - (toolbar.y + toolbar.height);
      expect(gapBelowToolbar).toBeGreaterThan(5);
      expect(unused.y - (toolbar.y + toolbar.height)).toBeCloseTo(orientation === 'below' ? unused.y - (toolbar.y + toolbar.height) : gapBelowToolbar, 0);
      if (orientation === 'below') expect(unused.y - (lines.y + lines.height)).toBeCloseTo(gapBelowToolbar, 0);
      else expect(unused.y).toBeCloseTo(lines.y, 0);
    });
  }
});

/**
 * On a touchscreen, which can't hover, a field's controls show once it's tapped.
 *
 * @see docs/line-layout-editor.md § "Using it"
 */
test.describe('Scene info panel editor on a touchscreen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

  test.beforeEach(async ({ request }) => {
    await setPanelConfig(request, {});
  });

  test.afterEach(async ({ request }) => {
    await setTvConfig(request, null);
  });

  test('shows a field\'s controls once it\'s tapped, rather than pressing the hidden one under the tap', async ({ page }) => {
    await page.goto('/');
    await currentSlide(page).getByRole('button', { name: 'Show scene info' }).tap();
    await expect(infoPanel(page)).toHaveClass(/active/);
    await infoPanel(page).getByRole('button', { name: 'Customise info panel' }).tap();
    await morphDone(page);
    const title = await box(pill(page, 'title'));
    const controls = pill(page, 'title').locator('.item-controls');
    const opacity = () => controls.evaluate((element) => Number(getComputedStyle(element).opacity));

    // Where its × is, once shown
    await page.touchscreen.tap(title.x + 8, title.y + title.height / 2);
    await expect.poll(opacity).toBe(1);
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['performers'], ['date']]);

    // Now it's shown, tapping it removes the field
    await page.touchscreen.tap(title.x + 8, title.y + title.height / 2);
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['performers'], ['date']]);
  });
});

/**
 * A pen that hovers (e.g. a drawing tablet's) shows a field's controls as a mouse does, so a press on one presses it,
 * rather than revealing them as a tap does. Playwright has no pen, so it's driven through the DevTools protocol.
 *
 * @see docs/line-layout-editor.md § "Using it"
 */
test.describe('Scene info panel editor with a pen', () => {
  test.afterEach(async ({ request }) => {
    await setTvConfig(request, null);
  });

  test('opens a field\'s options with the first press of a pen hovering over its options button', async ({ page, request }) => {
    await setPanelConfig(request, {});
    await startEditing(page);
    const options = pill(page, 'performers').getByRole('button', { name: 'Performers options' });
    await pill(page, 'performers').hover();
    const { x, y, width, height } = await box(options);
    const point = { x: x + width / 2, y: y + height / 2, pointerType: 'pen' as const };
    // Off it, so the pen hovers onto it
    await page.mouse.move(0, 0);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, x: point.x - 10 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

/**
 * The fields' options, where what they do depends on layout.
 *
 * @see docs/scene-info-panel.md § "Fields"
 * @see docs/scene-info-panel.md § "Field options"
 */
test.describe('Scene info panel fields', () => {
  test.use({ viewport: { width: 600, height: 800 } });

  // The first slide's scene, given enough tags to take more than 3 rows
  const sceneId = 'scene-7';
  const extraTagIds: string[] = [];
  test.beforeEach(async ({ request }) => {
    for (let i = 1; i <= 30; i++) {
      const data = await graphql(request, 'mutation ($input: TagCreateInput!) { tagCreate(input: $input) { id } }', {
        input: { name: `Extra tag ${i}` },
      });
      extraTagIds.push(data.tagCreate.id);
    }
    await graphql(request, 'mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }', {
      input: { id: sceneId, tag_ids: extraTagIds },
    });
    await setPanelConfig(request, { sceneInfoLayout: [['title'], ['tags']] });
  });

  test.afterEach(async ({ request }) => {
    await graphql(request, 'mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }', {
      input: { id: sceneId, tag_ids: ['tag-beta'] },
    });
    for (const id of extraTagIds.splice(0)) {
      await graphql(request, 'mutation ($input: TagDestroyInput!) { tagDestroy(input: $input) }', { input: { id } });
    }
    await setTvConfig(request, null);
  });

  /** The tops of the rows of tags that can be seen, top to bottom */
  async function visibleTagRows(page: Page) {
    return await infoPanel(page).locator('.field-tags .tag-list').evaluate((list) => {
      const { bottom } = list.getBoundingClientRect();
      const tops = [...list.children]
        .map((tag) => tag.getBoundingClientRect().top)
        .filter((top) => top < bottom - 1);
      return [...new Set(tops.map(Math.round))];
    });
  }

  /** How many of the tags are shown, and the button showing the rest */
  async function shownTags(page: Page) {
    return await infoPanel(page).locator('.field-tags .tag-list').evaluate((list) => {
      const { bottom } = list.getBoundingClientRect();
      return [...list.children].filter((tag) => tag.getBoundingClientRect().top < bottom - 1).length;
    });
  }

  test('shows 2 whole rows of tags, with a button below them showing how many more there are', async ({ page }) => {
    await openInfoPanel(page);
    const tags = infoPanel(page).locator('.field-tags');
    await expect(tags).toHaveClass(/capped/);
    expect(await visibleTagRows(page)).toHaveLength(2);
    // No tag is partly cut off
    const cutOff = await tags.locator('.tag-list').evaluate((list) => {
      const { bottom } = list.getBoundingClientRect();
      return [...list.children].filter((tag) => {
        const rect = tag.getBoundingClientRect();
        return rect.top < bottom - 1 && rect.bottom > bottom + 1;
      }).length;
    });
    expect(cutOff).toBe(0);

    const showMore = tags.getByRole('button', { name: /^Show \d+ more$/ });
    await expect(showMore).toHaveText(`Show ${extraTagIds.length - await shownTags(page)} more`);
    const [list, button] = await Promise.all([box(tags.locator('.tag-list')), box(showMore)]);
    expect(button.y).toBeGreaterThanOrEqual(list.y + list.height - 1);

    await showMore.click();
    await expect(tags).not.toHaveClass(/capped/);
    expect((await visibleTagRows(page)).length).toBeGreaterThan(2);
    await expect(showMore).toHaveCount(0);
  });

  test('shows every tag when only one more than fits would be hidden', async ({ page, request }) => {
    await openInfoPanel(page);
    await expect(infoPanel(page).locator('.field-tags')).toHaveClass(/capped/);
    const fitting = await shownTags(page);
    await graphql(request, 'mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }', {
      input: { id: sceneId, tag_ids: extraTagIds.slice(0, fitting + 1) },
    });

    await openInfoPanel(page);
    const tags = infoPanel(page).locator('.field-tags');
    await expect(tags.locator('.tag-item')).toHaveCount(fitting + 1);
    await expect(tags).not.toHaveClass(/capped/);
    await expect(tags.getByRole('button')).toHaveCount(0);
    expect(await visibleTagRows(page)).toHaveLength(3);
  });

  test('shows every tag when asked to', async ({ page }) => {
    await startEditing(page);
    await clickFieldControl(pill(page, 'tags').getByRole('button', { name: 'Tags options' }));
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Always show every tag').click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);
    await saveEdits(page);

    const tags = infoPanel(page).locator('.field-tags');
    await expect(tags).not.toHaveClass(/capped/);
    expect((await visibleTagRows(page)).length).toBeGreaterThan(2);
  });

  // 3 is too small a rating for a star (e.g. given as 0.3 out of 10 with the decimal system), so it shows as none
  for (const rating100 of [null, 3]) {
    test(`shows nothing beside the stars with a rating of ${rating100}, even hovering one`, async ({ page, request }) => {
      await setPanelConfig(request, { sceneInfoLayout: [['title', 'rating']] });
      await graphql(request, 'mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }', {
        input: { id: sceneId, rating100 },
      });
      try {
        await openInfoPanel(page);
        const rating = infoPanel(page).locator('.field-rating');
        await expect(rating.locator('.rating-stars')).toBeVisible();
        await expect(rating.locator('.star-rating-number:visible')).toHaveCount(0);
        await rating.locator('.rating-stars button').nth(2).hover();
        await expect(rating.locator('.star-rating-number:visible')).toHaveCount(0);
      } finally {
        await graphql(request, 'mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }', {
          input: { id: sceneId, rating100: null },
        });
      }
    });
  }

  for (const rightAligned of [false, true]) {
    test(`shows "Clear" over the current rating's star, ${rightAligned ? 'left' : 'right'} of the stars${rightAligned ? ' (right-aligned)' : ''}`, async ({ page, request }) => {
      await setPanelConfig(request, { sceneInfoLayout: rightAligned ? [{ left: ['title'], right: ['rating'] }] : [['title', 'rating']] });
      await graphql(request, 'mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }', {
        input: { id: sceneId, rating100: 60 },
      });
      try {
        await openInfoPanel(page);
        const rating = infoPanel(page).locator('.field-rating');
        const stars = rating.locator('.rating-stars button');
        const shown = rating.locator('.star-rating-number:visible');
        await expect(shown).toHaveText('3');

        await stars.nth(2).hover();
        await expect(shown).toHaveText('Clear');
        const [clear, firstStar, lastStar] = await Promise.all([box(shown), box(stars.first()), box(stars.last())]);
        if (rightAligned) expect(clear.x + clear.width).toBeLessThanOrEqual(firstStar.x + 1);
        else expect(clear.x).toBeGreaterThanOrEqual(lastStar.x + lastStar.width - 1);
      } finally {
        await graphql(request, 'mutation ($input: SceneUpdateInput!) { sceneUpdate(input: $input) { id } }', {
          input: { id: sceneId, rating100: null },
        });
      }
    });
  }

  test('adds a copy of the spacer dragged in from the unused fields, which is space beside fields', async ({ page }) => {
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const unusedSpacer = infoPanel(page).locator('.available-items .field-pill[data-field="spacer"]');
    await dragTo(page, unusedSpacer, pastEnd(title), title.y + title.height / 2);
    // Still there to add another
    await expect(unusedSpacer).toHaveCount(1);
    const lines = await editorLayout(page);
    // The layout's set up as the title's line, then the tags'
    expect(lines[0]).toEqual(['title', 'spacer']);

    await saveEdits(page);
    const beside = infoPanel(page).locator('.field-line').first().locator('.field-spacer');
    expect((await box(beside)).width).toBeGreaterThan(0);
  });

  test('shows a spacer alone on its line as space between the lines, but not at the panel\'s bottom', async ({ page, request }) => {
    const spacer = (id: string) => [{ field: 'spacer', id, options: { size: 'big' } }];
    await setPanelConfig(request, { sceneInfoLayout: [['title'], spacer('1'), ['tags'], spacer('2')] });
    await openInfoPanel(page);

    const between = infoPanel(page).locator('.field-line').nth(1).locator('.field-spacer');
    const betweenBox = await box(between);
    expect(betweenBox.width).toBe(0);
    expect(betweenBox.height).toBeGreaterThan(0);
    // With nothing shown after it
    await expect(infoPanel(page).locator('.field-line').last()).toHaveClass(/collapsed-spacer/);
    await expect(infoPanel(page).locator('.field-line').last()).toBeHidden();
  });

  test('shows a spacer\'s pill, showing values, as a line as long as its space, whose controls overlap its neighbours', async ({ page, request }) => {
    const spacer = (id: string, size: string) => ({ field: 'spacer', id, options: { size } });
    await setPanelConfig(request, { sceneInfoLayout: [['title', spacer('1', 'small'), 'date'], [spacer('2', 'big')], ['performers']] });
    await startEditing(page);
    await infoPanel(page).getByRole('button', { name: 'Field value' }).click();
    await morphDone(page);

    const [besideFields, ownLine] = await infoPanel(page).locator('.layout-lines .spacer-pill').all();
    const em = await besideFields.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    // Beside fields it's space along the line (small: 0.5em), and alone on its line space between lines (big: 2em)
    expect((await box(besideFields)).width).toBeCloseTo(0.5 * em, 0);
    expect((await box(ownLine)).height).toBeCloseTo(2 * em, 0);

    // Hovering over it shows its controls over the fields beside it, which stay where they are
    const date = await box(pill(page, 'date'));
    await besideFields.hover();
    const remove = infoPanel(page).getByRole('button', { name: 'Remove Small spacer' });
    // Its icon: the controls' rounded corners aren't part of the button (see expectUsableOnScreen)
    await expectUsableOnScreen(remove.locator('svg'));
    expect((await box(remove.locator('xpath=ancestor::*[contains(@class, "item-controls")]'))).width).toBeGreaterThan((await box(besideFields)).width);
    expect(await box(pill(page, 'date'))).toEqual(date);

    // Other pills are outlined only while hovered over
    const borderColor = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).borderTopColor);
    await expect.poll(() => borderColor(pill(page, 'performers'))).toBe('rgba(0, 0, 0, 0)');
    await pill(page, 'performers').hover();
    await expect.poll(() => borderColor(pill(page, 'performers'))).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('shows a spacer alone on its line, dragged, as it will be where it\'s dropped, or as it was with nowhere to go', async ({ page, request }) => {
    const spacer = { field: 'spacer', id: '1', options: { size: 'big' } };
    await setPanelConfig(request, { sceneInfoLayout: [['title', 'date'], [spacer], ['performers']] });
    await startEditing(page);
    await infoPanel(page).getByRole('button', { name: 'Field value' }).click();
    await morphDone(page);
    const dragged = infoPanel(page).locator('.drag-overlay:not(.settling) .spacer-line');
    const isUpright = async () => {
      const { width, height } = await box(dragged);
      return height > width;
    };

    const spacerPill = await box(infoPanel(page).locator('.layout-lines .spacer-pill'));
    const date = await box(pill(page, 'date'));
    // Over its own line, up and down
    await startDrag(page, infoPanel(page).locator('.layout-lines .spacer-pill'), spacerPill.x + 30, spacerPill.y + spacerPill.height / 2);
    expect(await isUpright()).toBe(true);
    // Beside the date, along the line
    await page.mouse.move(date.x + date.width - 2, date.y + date.height / 2, { steps: 10 });
    expect(await isUpright()).toBe(false);
    // Nowhere to go (above the editor), as on the line it's going back to
    await page.mouse.move(date.x, 5, { steps: 10 });
    await expect(infoPanel(page).locator('.drag-overlay:not(.settling)')).not.toHaveAttribute('data-drop');
    expect(await isUpright()).toBe(true);
    await page.mouse.up();
  });

  test('opens the o-count\'s controls above it once it\'s been marked', async ({ page, request }) => {
    await setPanelConfig(request, { sceneInfoLayout: [['title'], ['o-count']] });
    await openInfoPanel(page);
    const oCount = infoPanel(page).locator('.field-o-count button');
    await oCount.click();
    await expect(oCount).toHaveClass(/state-active/);
    await oCount.click();

    const increase = page.getByRole('button', { name: 'Increase O-count' });
    await expectUsableOnScreen(increase);
    expect((await box(increase)).y).toBeLessThan((await box(oCount)).y);

    // Back to how it was
    await page.getByRole('button', { name: 'Decrease O-count' }).click();
  });
});
