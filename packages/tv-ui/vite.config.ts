import { defineConfig, loadEnv, ProxyOptions, UserConfig } from "vite";
import svgr from 'vite-plugin-svgr';
import pkg from "../../package.json" with { type: "json" };
import { ClientRequest } from "http";
import escapeStringRegexp from 'escape-string-regexp';
import { proxyPrefix } from "./src/constants";

export default defineConfig(({mode}) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the
  // `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')

  const port = env.DEV_PORT ? parseInt(env.DEV_PORT) : undefined;
  const host = env.DEV_HOST?.toLowerCase() === "true" ? true : env.DEV_HOST
  const allowedHosts = env.DEV_ALLOWED_HOSTS?.toLowerCase() === "true" ? true : env.DEV_ALLOWED_HOSTS?.split(",");

  const proxyStash = env.STASH_PROXY?.toLowerCase().trim() === "true";

  // We reuse the code Stash's UI which connects to the Stash server from the client and that expects
  // VITE_APP_PLATFORM_URL to be set to the Stash server address when running in dev mode.
  if (mode === "development" && !proxyStash) {
    process.env.VITE_APP_PLATFORM_URL=env.STASH_ADDRESS
  }

  process.env.VITE_STASH_TV_VERSION = pkg.version;

  const stashUrl = env.STASH_ADDRESS ? new URL(env.STASH_ADDRESS) : undefined;

  if (proxyStash && !env.STASH_ADDRESS) {
    throw new Error("STASH_PROXY is enabled but STASH_ADDRESS is not set");
  }

  const proxyOptions: ProxyOptions = {
    target: env.STASH_ADDRESS,
    changeOrigin: true,
    ws: true,
    rewriteWsOrigin: true,
    configure: (proxy) => {
      const addHeaders = (proxyReq: ClientRequest) => {
        for (const header of env.STASH_PROXY_HEADERS?.split(",").map(h => h.trim()) ?? []) {
          const key = header.slice(0, header.indexOf(":")).trim();
          const value = header.slice(header.indexOf(":") + 1).trim();
          proxyReq.setHeader(key, value);
        }
      }
      proxy.on('proxyReq', addHeaders);
      proxy.on('proxyReqWs', addHeaders);
      proxy.on('proxyRes', (proxyRes, req, res) => {
        const originalWrite = res.write;
        const originalEnd = res.end;

        let body = Buffer.from('');

        const contentType = (proxyRes.headers["content-type"] || "").toLowerCase();
        const rewriteBody = contentType.startsWith("text/") || contentType.endsWith("json");
        // Rewriting Stash's URLs changes the body's length, so Stash's Content-Length would be wrong: the browser would
        // stop reading early, or wait for bytes that never come and fail (ERR_CONTENT_LENGTH_MISMATCH). Without it the
        // response is sent chunked. http-proxy copies Stash's headers onto the response after this event.
        if (rewriteBody) delete proxyRes.headers["content-length"];

        res.write = function(...args) {
          const [chunk] = args;
          if (rewriteBody) {
            body = Buffer.concat([body, Buffer.from(chunk)]);
          } else {
            // @ts-expect-error - We should see if we can fix this type error
            originalWrite.call(res, ...args);
          }
          return true;
        };

        // @ts-expect-error - We should see if we can fix this type error
        res.end = function(...args) {
          const [chunk] = args;
          if (!rewriteBody) {
            // @ts-expect-error - We should see if we can fix this type error
            originalEnd.call(res, ...args)
            return
          }
          if (chunk) {
            body = Buffer.concat([body, Buffer.from(chunk)]);
          }

          let bodyStr = body.toString();
          const stashHost = stashUrl?.host || "";
          if (bodyStr.includes(stashHost)) {
            bodyStr = bodyStr.replace(new RegExp(`(?:(http)s(:\/\/))?${escapeStringRegexp(stashHost)}`, "g"), `$1$2${req.headers["host"]}${proxyPrefix}`);
            // @ts-expect-error - We should see if we can fix this type error
            originalWrite.call(res, bodyStr);
          } else {
            // @ts-expect-error - We should see if we can fix this type error
            originalWrite.call(res, body);
          }

          // @ts-expect-error - We should see if we can fix this type error
          originalEnd.call(res);
        };
      });
    },
    rewrite: path => path.replace(/^\/stash/, '')
  }

  return {
    root: "src",
    envDir: "..",
    build: {
      outDir: "../dist/app",
      minify: false,
      sourcemap: true,
      emptyOutDir: true,
      rollupOptions: {
        onwarn(warning, warn) {
          // framer-motion and Radix mark their modules "use client", for React Server Components, which a client-only
          // bundle ignores. Each would otherwise print a warning, burying any that matter.
          if (warning.code === "MODULE_LEVEL_DIRECTIVE" && warning.message.includes('"use client"')) return;
          // Rollup's attempt to point those warnings at the original source
          if (warning.code === "SOURCEMAP_ERROR") return;
          warn(warning);
        },
      },
    },
    base: "./",
    server: {
      port,
      host,
      allowedHosts,
      ...(proxyStash ? {
        proxy: {
          '/graphql': proxyOptions,
          '/stash': proxyOptions
        }
      } : {})
    },
    envPrefix: ["VITE_", "STASH_ADDRESS"],
    plugins: [svgr()]
  } satisfies UserConfig
})
