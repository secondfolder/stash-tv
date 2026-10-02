import { test, expect, type Locator, type Page } from '@playwright/test';
import { graphql, setTvConfig } from './helpers/stash';
import { expectUsableOnScreen } from './helpers/layout';

/**
 * E2E tests: customising the scene info panel. Where its edit button and editor sit, and dragging its fields' pills
 * into place, depend on layout and pointer events, so they're only testable here.
 *
 * @see docs/scene-info-panel.md § "Customising the panel"
 * @see docs/scene-info-panel.md § "Moving fields"
 */

function currentSlide(page: Page) {
  return page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');
}

function infoPanel(page: Page) {
  return currentSlide(page).getByTestId('MediaSlide--sceneInfo');
}

async function openInfoPanel(page: Page) {
  await page.goto('/');
  await currentSlide(page).getByRole('button', { name: 'Show scene info' }).click();
  await expect(infoPanel(page)).toHaveClass(/active/);
}

async function startEditing(page: Page) {
  await openInfoPanel(page);
  await infoPanel(page).getByRole('button', { name: 'Customise info panel' }).click();
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
  return await infoPanel(page).locator('.editor-lines [data-line]').evaluateAll((items) => {
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
      for (const section of document.querySelectorAll<HTMLElement>('[data-current-video="true"] .SceneInfo.editing :is(.editor-toolbar, .unused-fields)')) {
        if (sliding(section)) record.slid.add(section.classList.contains('editor-toolbar') ? 'toolbar' : 'unused fields');
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
      for (const item of document.querySelectorAll<HTMLElement>('[data-current-video="true"] .SceneInfo.editing .editor-lines [data-line]')) {
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

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  if (!result) throw new Error('Element not rendered');
  return result;
}

test.describe('Scene info panel', () => {
  test.beforeEach(async ({ request }) => {
    await setTvConfig(request, {});
  });

  test.afterEach(async ({ request }) => {
    await setTvConfig(request, null);
  });

  for (const leftHandedUi of [false, true]) {
    test(`has an edit button in its top right corner, clear of the action buttons${leftHandedUi ? ' (left-handed)' : ''}`, async ({ page, request }) => {
      await setTvConfig(request, { leftHandedUi });
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
    // Its name rather than the pill, whose rounded corners aren't part of it
    await expectUsableOnScreen(lastAvailable.locator('.pill-name'));
    // Scrolling the panel mustn't have scrolled the feed on to another video
    await expectUsableOnScreen(infoPanel(page).getByRole('button', { name: 'Save' }));
  });

  test('puts a field dragged onto a field on another line in its place, even drifting onto its right half', async ({ page, request }) => {
    await setTvConfig(request, { sceneInfoLayout: [['date'], ['performers']] });
    await startEditing(page);
    const performers = await box(pill(page, 'performers'));

    // Down and a little to the right, ending over the right half of the field below. (Much further right reads as moving
    // back onto it after taking its place, which swaps them.)
    await dragTo(page, pill(page, 'date'), performers.x + performers.width * 0.6, performers.y + performers.height / 2);

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
    await setTvConfig(request, { sceneInfoLayout: [['title', 'date'], ['performers']] });
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const performers = await box(pill(page, 'performers'));

    await dragTo(page, pill(page, 'date'), title.x + 4, (title.y + title.height + performers.y) / 2);

    await expect.poll(() => editorLayout(page)).toEqual([['title'], ['date'], ['performers']]);
    await infoPanel(page).getByRole('button', { name: 'Save' }).click();
    await expect(infoPanel(page).locator('.field-line')).toHaveText(['Grotto Glow', '2025-02-14', 'Bob Bold']);

    await page.reload();
    await currentSlide(page).getByRole('button', { name: 'Show scene info' }).click();
    await expect(infoPanel(page).locator('.field-line')).toHaveText(['Grotto Glow', '2025-02-14', 'Bob Bold']);
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
    await expect(infoPanel(page).locator('.editor-lines .field-pill.ghost')).toHaveCount(1);
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
    const unused = await box(infoPanel(page).locator('.unused-fields'));

    await dragTo(page, pill(page, 'performers'), unused.x + unused.width / 2, unused.y + unused.height / 2);

    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['date']]);
    await expect(infoPanel(page).getByRole('button', { name: 'Add Performers' })).toBeVisible();
  });

  test('marks where a new line will go with a ghost line between the lines, without moving them', async ({ page, request }) => {
    await setTvConfig(request, { sceneInfoLayout: [['studio'], ['title', 'date'], ['performers']] });
    await startEditing(page);
    const fieldsAndSections = [pill(page, 'studio'), pill(page, 'title'), pill(page, 'performers'),
      infoPanel(page).locator('.editor-toolbar'), infoPanel(page).locator('.unused-fields')];
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
    await setTvConfig(request, { sceneInfoLayout: [['title'], ['date']] });
    await startEditing(page);
    const lines = await box(infoPanel(page).locator('.editor-lines'));
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
    await infoPanel(page).getByRole('button', { name: 'Save' }).click();
    const line = infoPanel(page).locator('.field-line');
    await expect(line).toHaveText(['Grotto Glow2025-02-14']);
    const rightAligned = line.locator('.right-aligned-fields');
    await expect(rightAligned).toHaveText('2025-02-14');
    expect(await rightEdge(rightAligned)).toBeCloseTo(await rightEdge(line), 0);

    await page.reload();
    await currentSlide(page).getByRole('button', { name: 'Show scene info' }).click();
    await expect(infoPanel(page).locator('.field-line .right-aligned-fields')).toHaveText('2025-02-14');
  });

  test('highlights the line a field is dragged onto, but not between lines', async ({ page, request }) => {
    await setTvConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['date'] }, ['performers'], ['tags']] });
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const date = await box(pill(page, 'date'));
    const performers = await box(pill(page, 'performers'));
    const highlighted = infoPanel(page).locator('.editor-line.target');

    await startDrag(page, pill(page, 'tags'), (title.x + title.width + date.x) / 2, title.y + title.height / 2);
    // The whole line, its right-aligned fields included
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted.locator('.field-pill')).toHaveText([/Title/, /Tags/, /Date/]);
    expect(await highlighted.evaluate((line) => getComputedStyle(line).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');

    await page.mouse.move(performers.x + 8, (title.y + title.height + performers.y) / 2, { steps: 5 });
    await expect(infoPanel(page).locator('.ghost-line')).toHaveCount(1);
    await expect(highlighted).toHaveCount(0);
    await page.mouse.up();
  });

  test('highlights the line the pointer\'s over while editing', async ({ page, request }) => {
    await setTvConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['date'] }, ['performers']] });
    await startEditing(page);
    const background = (line: Locator) => line.evaluate((element) => getComputedStyle(element).backgroundColor);
    const lines = infoPanel(page).locator('.editor-line');
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
    await setTvConfig(request, { sceneInfoLayout: [{ left: ['title', 'performers', 'date'], right: ['duration', 'resolution', 'o-count'] }, ['studio']] });
    await page.setViewportSize({ width: 500, height: 800 });
    await startEditing(page);
    const lineBox = await box(infoPanel(page).locator('.editor-line').first());
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
    const em = await infoPanel(page).locator('.editor-line').first().evaluate((line) => parseFloat(getComputedStyle(line).fontSize));
    const rightStart = (await box(infoPanel(page).locator('.line-side.right'))).x;
    for (const right of leftRows) expect(right).toBeLessThanOrEqual(rightStart - 2 * em + 0.5);

    // And the same in the panel itself
    await infoPanel(page).getByRole('button', { name: 'Save' }).click();
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
    await setTvConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['tags', 'performers'] }] });
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
    await setTvConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['duration', 'resolution'] }] });
    await openInfoPanel(page);
    const panelField = (field: string) => box(infoPanel(page).locator(`.field-${field}`));
    expect((await panelField('duration')).x).toBeGreaterThan((await panelField('resolution')).x);

    await infoPanel(page).getByRole('button', { name: 'Customise info panel' }).click();
    expect((await box(pill(page, 'duration'))).x).toBeGreaterThan((await box(pill(page, 'resolution'))).x);
  });

  test('moves a field along a line\'s right-aligned fields, which run from right to left', async ({ page, request }) => {
    await setTvConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['duration', 'resolution', 'date'] }] });
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
    const lines = await box(infoPanel(page).locator('.editor-lines'));
    await expect.poll(async () => {
      const date = await box(pill(page, 'date'));
      return date.x + date.width;
    }).toBeCloseTo(lines.x + lines.width, 0);
  });

  test('puts a field dropped on the right third of the space before a line\'s right-aligned fields beside them', async ({ page, request }) => {
    await setTvConfig(request, { sceneInfoLayout: [{ left: ['title'], right: ['duration'] }, ['date']] });
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
    await setTvConfig(request, { sceneInfoLayout: [['title', 'date'], ['performers']] });
    await startEditing(page);
    const lines = await box(infoPanel(page).locator('.editor-lines'));
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
    await setTvConfig(request, { sceneInfoLayout: [['studio', 'title'], ['date'], ['performers']] });
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
    await setTvConfig(request, { sceneInfoLayout: [['studio'], ['date'], ['performers']] });
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
    await setTvConfig(request, { sceneInfoLayout: [['studio'], ['title'], ['performers']] });
    await startEditing(page);
    await page.evaluate(() => {
      const record = window as unknown as { maxLines: number };
      record.maxLines = 0;
      const sample = () => {
        const lines = new Set([...document.querySelectorAll<HTMLElement>('[data-current-video="true"] .SceneInfo.editing .editor-lines [data-line]')].map((item) => item.dataset.line));
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
    await setTvConfig(request, { sceneInfoLayout: [['date', 'performers']] });
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
    await setTvConfig(request, { sceneInfoLayout: [['studio'], ['title'], ['performers'], ['date']] });
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
        for (const pill of panel.querySelectorAll<HTMLElement>('.editor-lines .field-pill')) {
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
    await setTvConfig(request, { sceneInfoLayout: [['studio'], ['title', 'date'], ['performers']] });
    await startEditing(page);
    const title = await box(pill(page, 'title'));
    const performers = await box(pill(page, 'performers'));
    const date = await box(pill(page, 'date'));
    await startDrag(page, pill(page, 'date'), date.x + 8, (title.y + title.height + performers.y) / 2);
    await expect(infoPanel(page).locator('.ghost-line')).toHaveCount(1);

    await recordSlidingFields(page);
    await page.mouse.up();
    await expect.poll(() => editorLayout(page)).toEqual([['studio'], ['title'], ['date'], ['performers']]);

    // The panel grows upwards, so the lines above the new one move up, and the toolbar with them. Side by side (the
    // screen's wider than it's tall) the unused fields move up too. The panel's background grows with them.
    expect(await slidFields(page)).toEqual(expect.arrayContaining(['studio', 'title', 'toolbar', 'unused fields', 'background']));
    // And ends up the panel's size
    const [panelBox, backgroundBox] = await Promise.all([box(infoPanel(page)), box(infoPanel(page).locator('.panel-background'))]);
    expect(backgroundBox.y).toBeCloseTo(panelBox.y, 0);
    expect(backgroundBox.height).toBeCloseTo(panelBox.height, 0);
  });

  test('slides a field and the ghost of one dragged onto it from the line above into their new places', async ({ page, request }) => {
    await setTvConfig(request, { sceneInfoLayout: [['date'], ['performers']] });
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

    await infoPanel(page).getByRole('button', { name: 'Add Tags' }).click();

    expect(await slidFields(page)).toContain('tags');
  });

  test('slides a removed field into the unused fields', async ({ page }) => {
    await startEditing(page);
    await recordSlidingFields(page);

    await infoPanel(page).getByRole('button', { name: 'Remove Title' }).click();

    expect(await slidFields(page)).toContain('title');
  });

  test('moves a field along a line that wraps onto another row without sending it to the end', async ({ page, request }) => {
    const fields = ['studio', 'title', 'performers', 'date', 'details', 'tags', 'groups', 'code', 'director', 'rating'];
    await setTvConfig(request, { sceneInfoLayout: [fields] });
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
    await setTvConfig(request, { sceneInfoLayout: [fields, ['urls']] });
    await page.setViewportSize({ width: 500, height: 800 });
    await startEditing(page);
    const firstRowStart = (await box(pill(page, 'studio'))).x;
    const wrappedRowStart = Math.min(...await infoPanel(page).locator('.editor-lines .field-pill').evaluateAll((pills) => {
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
    await setTvConfig(request, { sceneInfoLayout: [['studio', 'title', 'performers'], ['date']] });
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

    await infoPanel(page).getByRole('button', { name: 'Add Tags' }).click();
    const after = await box(infoPanel(page));
    expect(after.y + after.height).toBeCloseTo(before.y + before.height, 0);
    expect(after.y).toBeLessThan(before.y);

    for (const name of ['Details', 'Groups', 'Studio code', 'Director', 'Rating', 'Duration', 'Resolution', 'Play count', 'O-count', 'File path', 'URLs']) {
      await infoPanel(page).getByRole('button', { name: `Add ${name}` }).click();
    }
    const full = await box(infoPanel(page));
    expect(full.y).toBeGreaterThanOrEqual(0);
    expect(await infoPanel(page).locator('.panel-content').evaluate((content) => content.scrollHeight > content.clientHeight)).toBe(true);
  });

  test('shows the unused fields beside the fields on a screen wider than it is tall, and below them otherwise', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 600 });
    await startEditing(page);
    const lines = await box(infoPanel(page).locator('.editor-lines'));
    let unused = await box(infoPanel(page).locator('.unused-fields'));
    expect(unused.x).toBeGreaterThanOrEqual(lines.x + lines.width);

    await page.setViewportSize({ width: 600, height: 1000 });
    await expect.poll(async () => (await box(infoPanel(page).locator('.unused-fields'))).y)
      .toBeGreaterThanOrEqual((await box(infoPanel(page).locator('.editor-lines'))).y + 10);
    unused = await box(infoPanel(page).locator('.unused-fields'));
    expect(unused.x).toBeLessThan(lines.x + 20);
  });

  test('swaps a field with the one whose place it took as soon as it\'s dragged back onto it', async ({ page, request }) => {
    await setTvConfig(request, { sceneInfoLayout: [['date'], ['performers']] });
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
    await setTvConfig(request, { sceneInfoLayout: [fields] });
    await page.setViewportSize({ width: 500, height: 800 });
    await startEditing(page);
    const dragged = await box(pill(page, 'title'));
    // The field straight below it, on the line's next row
    const x = dragged.x + dragged.width / 2;
    const below = await infoPanel(page).locator('.editor-lines .field-pill').evaluateAll((pills, { x, draggedBottom }) => {
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
    await setTvConfig(request, { sceneInfoLayout: [fields, ['urls'], ['path', 'o-count']] });
    // Narrow enough for the first line to wrap onto three rows
    await page.setViewportSize({ width: 450, height: 800 });
    await startEditing(page);

    const markers = infoPanel(page).locator('.wrapped-line-marker');
    await expect(markers).toHaveCount(1);
    const marker = await box(markers);
    const studio = await box(pill(page, 'studio'));
    const laterRows = await infoPanel(page).locator('.editor-lines .field-pill[data-line="0"]').evaluateAll((pills, firstRowBottom) => {
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
    await setTvConfig(request, { sceneInfoLayout: [fields] });
    // Taller than it's wide throughout, so the unused fields stay below the lines
    await page.setViewportSize({ width: 900, height: 1400 });
    await startEditing(page);
    const slack = await infoPanel(page).locator('.editor-lines').evaluate((container) => {
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
    await setTvConfig(request, { sceneInfoLayout: [['studio'], full] });
    // Taller than it's wide throughout, so the unused fields stay below the lines
    await page.setViewportSize({ width: 900, height: 1400 });
    await startEditing(page);
    // Narrow the window until the second line only just fits on one row
    const slack = await infoPanel(page).locator('.editor-lines').evaluate((container) => {
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
    // The URLs are alone on the unused fields' last row
    await page.setViewportSize({ width: 600, height: 1000 });
    await startEditing(page);
    const unused = infoPanel(page).locator('.unused-fields');
    const urls = await box(pill(page, 'urls'));
    expect(urls.y).toBeGreaterThan((await box(pill(page, 'path'))).y);
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
    // A width at which the unused fields' last row has no room for another
    await page.setViewportSize({ width: 640, height: 1000 });
    await startEditing(page);
    const panelBottom = async () => { const panel = await box(infoPanel(page)); return panel.y + panel.height; };
    const bottomBefore = await panelBottom();
    const unusedBefore = await box(infoPanel(page).locator('.unused-fields'));

    const unused = await box(infoPanel(page).locator('.unused-fields'));
    await startDrag(page, pill(page, 'performers'), unused.x + unused.width / 2, unused.y + unused.height - 6);
    await page.waitForTimeout(500);

    // The unused fields have grown to take it, and the panel's bottom hasn't moved
    expect((await box(infoPanel(page).locator('.unused-fields'))).height).toBeGreaterThan(unusedBefore.height);
    expect(await panelBottom()).toBeCloseTo(bottomBefore, 0);
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(await panelBottom()).toBeCloseTo(bottomBefore, 0);
  });

  test('shows the ghost of a field dragged to the unused fields in its usual place among them', async ({ page }) => {
    await startEditing(page);
    const unused = await box(infoPanel(page).locator('.unused-fields'));

    await startDrag(page, pill(page, 'title'), unused.x + unused.width / 2, unused.y + unused.height - 6);

    // Fields are listed in their usual order, which has the title before the details
    const listed = infoPanel(page).locator('.unused-field-list > .field-pill');
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
        const rowsOf = async (line: number) => await infoPanel(page).locator(`.editor-lines .field-pill[data-line="${line}"]:not(.ghost)`)
          .evaluateAll((pills) => new Set(pills.map((pill) => Math.round(pill.getBoundingClientRect().top))).size);

        // Find the narrowest width at which the line takes `rowsBefore` rows (as little room left on its last row as
        // there can be)
        await setTvConfig(request, { sceneInfoLayout: layout });
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
            await setTvConfig(request, { sceneInfoLayout: layout });
            await page.setViewportSize({ width: width + extra, height });
            await startEditing(page);
            const before = await rowsOf(targetLine);
            if (before !== rowsBefore) continue;
            const field = await box(pill(page, onto === 'first' ? target[0] : target[target.length - 1]));
            await startDrag(page, pill(page, dragged), field.x + 6, field.y + field.height / 2);
            await page.waitForTimeout(500);
            const settled = await layoutsOverTime(page, 600);
            const ghostOnLine = await infoPanel(page).locator('.editor-lines .field-pill.ghost').count();
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
    await setTvConfig(request, {
      // So the video doesn't end, moving the feed on to the next one, mid-drag
      looping: true,
      sceneInfoLayout: [
        { left: ['studio', 'title', 'performers', 'date', 'tags', 'groups', 'path', 'urls'], right: ['rating', 'duration', 'resolution', 'play-count', 'o-count', 'code', 'director'] },
        ['details'],
      ],
    });
    await page.setViewportSize({ width: 1400, height: 900 });
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
      await page.waitForTimeout(500);
      const lines = infoPanel(page).locator('.editor-lines > .editor-line');
      const linesBox = await box(infoPanel(page).locator('.editor-lines'));
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
          ghostShown ||= await infoPanel(page).locator('.editor-lines .field-pill.ghost').count() > 0;
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
    await setTvConfig(request, { sceneInfoLayout: [wrapping, ['urls', 'path'], ['o-count']] });
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
    await setTvConfig(request, { sceneInfoLayout: [
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
        const toolbar = panel?.querySelector<HTMLElement>('.editor-toolbar');
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
    await infoPanel(page).getByRole('button', { name: 'Remove O-count' }).click();
    await page.waitForTimeout(700);

    expect((await box(infoPanel(page))).height).toBeLessThan(panelBefore.height - 10);
    const { clipped, frames } = await page.evaluate(() => {
      const { clipped, frames } = window as unknown as { clipped: number, frames: number };
      return { clipped, frames };
    });
    expect(frames).toBeGreaterThan(5);
    expect(clipped).toBe(0);
  });

  for (const orientation of ['below', 'beside'] as const) {
    test(`spaces the toolbar, the lines and the unused fields evenly with the unused fields ${orientation} the lines`, async ({ page }) => {
      await page.setViewportSize(orientation === 'below' ? { width: 600, height: 1000 } : { width: 1280, height: 720 });
      await startEditing(page);
      const [toolbar, lines, unused] = await Promise.all(['.editor-toolbar', '.editor-lines', '.unused-fields']
        .map((selector) => box(infoPanel(page).locator(selector))));
      const gapBelowToolbar = lines.y - (toolbar.y + toolbar.height);
      expect(gapBelowToolbar).toBeGreaterThan(5);
      expect(unused.y - (toolbar.y + toolbar.height)).toBeCloseTo(orientation === 'below' ? unused.y - (toolbar.y + toolbar.height) : gapBelowToolbar, 0);
      if (orientation === 'below') expect(unused.y - (lines.y + lines.height)).toBeCloseTo(gapBelowToolbar, 0);
      else expect(unused.y).toBeCloseTo(lines.y, 0);
    });
  }
});
