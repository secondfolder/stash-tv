import { describe, expect, it } from "vitest";
import { getSceneStreamsKey } from "../../../src/helpers/getSceneStreamsKey";

/**
 * Unit tests for getSceneStreamsKey — the ScenePlayer remount key must ignore
 * Stash's per-request URL signing params but change for any real stream change.
 *
 * @see docs/video-player.md § "Known Stash ScenePlayer Quirks & Our Workarounds"
 */

const signedStream = (expires: number, signature: string, path = "/scene/1/stream", extraQuery = "") => ({
  url: `http://stash.example.com${path}?cid=abc123&expires=${expires}&signature=${signature}${extraQuery}`,
  mime_type: "video/mp4",
  label: "Direct stream",
});

describe("getSceneStreamsKey", () => {
  it("is unchanged when only the signing params change", () => {
    expect(getSceneStreamsKey([signedStream(1787770095, "1f14d7")]))
      .toBe(getSceneStreamsKey([signedStream(1787770098, "f474be")]));
  });

  it("matches unsigned URLs for the same streams", () => {
    const unsigned = { url: "http://stash.example.com/scene/1/stream", mime_type: "video/mp4", label: "Direct stream" };

    expect(getSceneStreamsKey([signedStream(1787770095, "1f14d7")])).toBe(getSceneStreamsKey([unsigned]));
  });

  it("changes when a stream's path changes", () => {
    expect(getSceneStreamsKey([signedStream(1, "a", "/scene/1/stream")]))
      .not.toBe(getSceneStreamsKey([signedStream(1, "a", "/scene/1/preview")]));
  });

  it("changes when a non-signing query param changes", () => {
    expect(getSceneStreamsKey([signedStream(1, "a", "/scene/1/stream.mp4", "&resolution=STANDARD")]))
      .not.toBe(getSceneStreamsKey([signedStream(1, "a", "/scene/1/stream.mp4", "&resolution=FULL_HD")]));
  });

  it("changes when a stream's label or mime type changes", () => {
    const base = signedStream(1, "a");

    expect(getSceneStreamsKey([base])).not.toBe(getSceneStreamsKey([{ ...base, label: "MKV" }]));
    expect(getSceneStreamsKey([base])).not.toBe(getSceneStreamsKey([{ ...base, mime_type: "video/webm" }]));
  });

  it("changes when a stream is added", () => {
    const base = signedStream(1, "a");

    expect(getSceneStreamsKey([base])).not.toBe(getSceneStreamsKey([base, { ...base, label: "MKV" }]));
  });

  it("falls back to the raw URL when it can't be parsed", () => {
    const stream = { url: "not a url", mime_type: null, label: null };

    expect(getSceneStreamsKey([stream])).toBe(getSceneStreamsKey([{ ...stream }]));
    expect(getSceneStreamsKey([stream])).not.toBe(getSceneStreamsKey([{ ...stream, url: "also not a url" }]));
  });
});
