/**
 * Force-regenerates the mock server's media fixtures. The server generates them on start
 * when they are missing, so this is only needed after changing `MEDIA_SPECS` or the
 * encoder settings in `src/generate-media.ts`.
 *
 * Usage: yarn --cwd packages/mock-stash generate-media
 */
import { generateMediaFixtures } from "../src/generate-media";
import { MEDIA_DIR } from "../src/fixtures";

generateMediaFixtures();
console.log(`media written to ${MEDIA_DIR}`);
