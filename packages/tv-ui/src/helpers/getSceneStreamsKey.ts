import hashObject from 'object-hash';
import { SceneStreamEndpoint } from "stash-ui/dist/src/core/generated-graphql";

// Query params Stash adds when it signs stream URLs (stashapp/stash#6529). They are regenerated every time the
// server resolves sceneStreams, so they change on every refetch even though the stream itself hasn't.
const STASH_URL_SIGNING_PARAMS = ["cid", "expires", "signature"];

/**
 * A key that identifies which streams a scene has, ignoring Stash's per-request URL signing params, so it only
 * changes when the streams themselves do.
 */
export function getSceneStreamsKey(sceneStreams: Pick<SceneStreamEndpoint, "url" | "mime_type" | "label">[]) {
  return hashObject(sceneStreams.map(stream => ({
    url: stripUrlSigningParams(stream.url),
    mime_type: stream.mime_type,
    label: stream.label,
  })));
}

function stripUrlSigningParams(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  for (const param of STASH_URL_SIGNING_PARAMS) {
    url.searchParams.delete(param);
  }
  return url.toString();
}
