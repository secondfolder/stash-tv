import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MEDIA_DIR, mediaFileFor } from "./fixtures";
import type { MockStore } from "./store";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".vtt": "text/vtt",
};

/**
 * Serves the committed media fixtures over Stash-shaped routes
 * (`/scene/{id}/stream.mp4`, `/scene/{id}/preview`, `/marker/{id}/stream`, ...) with
 * HTTP Range support so video players can seek.
 */
export function handleMediaRoute(
  req: IncomingMessage,
  res: ServerResponse,
  store: MockStore,
): boolean {
  const url = new URL(req.url ?? "/", "http://mock-stash.local");
  const segments = url.pathname.split("/").filter(Boolean);

  let filePath: string | null = null;

  if (segments[0] === "scene" && segments.length >= 3) {
    const sceneId = segments[1];
    const scene = store.scenes.get(sceneId);
    if (!scene) {
      res.writeHead(404).end();
      return true;
    }
    const rest = segments.slice(2).join("/");
    if (rest === "stream.mp4" || rest === "stream" || rest === "stream.webm") {
      const spec = mediaFileFor(sceneId);
      filePath = path.join(MEDIA_DIR, `${spec.name}${spec.ext}`);
    } else if (rest === "preview") {
      filePath = path.join(MEDIA_DIR, `${mediaFileFor(sceneId).name}-preview.webm`);
    } else if (rest === "screenshot" || rest === "webp" || rest === "sprite") {
      filePath = path.join(MEDIA_DIR, `${mediaFileFor(sceneId).name}.jpg`);
    } else if (rest === "stream.m3u8" || rest === "stream.mpd") {
      // HLS/DASH endpoints exist in sceneStreams; players fall back to direct streams.
      res.writeHead(501).end("mock-stash does not transcode");
      return true;
    } else {
      res.writeHead(404).end();
      return true;
    }
  } else if (segments[0] === "marker" && segments.length === 3) {
    const marker = store.markers.get(segments[1]);
    if (!marker) {
      res.writeHead(404).end();
      return true;
    }
    const spec = mediaFileFor(marker.scene_id);
    if (segments[2] === "stream") {
      filePath = path.join(MEDIA_DIR, `${spec.name}${spec.ext}`);
    } else if (segments[2] === "preview") {
      filePath = path.join(MEDIA_DIR, `${spec.name}-preview.webm`);
    } else if (segments[2] === "screenshot") {
      filePath = path.join(MEDIA_DIR, `${spec.name}.jpg`);
    }
  } else if (segments[0] === "scene" && segments.length === 2) {
    // `/scene/{id}_thumbs.vtt`
    const match = segments[1].match(/^(.*)_thumbs\.vtt$/);
    if (match) {
      res.writeHead(200, { ...corsHeaders(), "content-type": "text/vtt" }).end("WEBVTT\n\n");
      return true;
    }
  }

  if (!filePath) {
    res.writeHead(404).end();
    return true;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders()).end();
    return true;
  }

  serveFileWithRange(req, res, filePath);
  return true;
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Content-Type, Range",
    "access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges",
  };
}

function serveFileWithRange(req: IncomingMessage, res: ServerResponse, filePath: string) {
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    res.writeHead(404).end();
    return;
  }

  const contentType =
    MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
  const headers = {
    ...corsHeaders(),
    "content-type": contentType,
    "accept-ranges": "bytes",
  };

  const rangeHeader = req.headers.range;
  const rangeMatch = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);

  if (rangeMatch && (rangeMatch[1] !== "" || rangeMatch[2] !== "")) {
    let start: number;
    let end: number;
    if (rangeMatch[1] === "") {
      // suffix range: last N bytes
      const suffixLength = Number(rangeMatch[2]);
      start = Math.max(size - suffixLength, 0);
      end = size - 1;
    } else {
      start = Number(rangeMatch[1]);
      end = rangeMatch[2] === "" ? size - 1 : Number(rangeMatch[2]);
    }

    if (start >= size || end < start) {
      res.writeHead(416, { ...headers, "content-range": `bytes */${size}` }).end();
      return;
    }

    end = Math.min(end, size - 1);
    res.writeHead(206, {
      ...headers,
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": String(end - start + 1),
    });
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, "content-length": String(size) });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}
