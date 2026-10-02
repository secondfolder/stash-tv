import { test, expect } from '@playwright/test';
import { setActionButtons } from './helpers/stash';

/**
 * E2E tests: a closed folder previews the icons of its first 4 shown buttons. Only those 4 fit, which is down to CSS,
 * so it's only testable here (jsdom tests don't load stylesheets).
 *
 * @see docs/action-buttons.md § "Rendering (`ActionButtonStack`)"
 */

test.describe('Action button folder preview', () => {
  test.afterEach(async ({ request }) => {
    await setActionButtons(request, null);
  });

  test('previews the icons of only its first 4 shown buttons', async ({ page, request }) => {
    // Fixture scenes have no captions, so the subtitles button isn't shown and mustn't take one of the 4 places
    const buttonTypes = ['subtitles', 'loop', 'letterboxing', 'force-landscape', 'show-scene-info', 'rate-scene'];
    await setActionButtons(request, [{
      id: 'folder',
      type: 'folder',
      pinned: false,
      contents: buttonTypes.map((buttonType) => ({ id: buttonType, type: 'button', buttonType, pinned: false })),
    }]);

    await page.goto('/');
    const slide = page.locator('[data-testid="MediaSlide--container"][data-current-video="true"]');
    const icons = slide.getByRole('button', { name: 'Open folder' }).locator('.ActionButtonIcon');

    await expect(icons).toHaveCount(5);
    await expect(icons.locator('visible=true')).toHaveCount(4);
    await expect(icons.nth(4)).toBeHidden();
  });
});
