import { execFileSync } from "node:child_process";

/**
 * Probes (in a child process, since Playwright config loading is synchronous)
 * for the first port at or above `preferred` that nothing on loopback answers on.
 * A connect probe catches listeners on any loopback address (IPv4 or IPv6).
 */
function findFreePortSync(preferred: number): number {
  const script = `
    const net = require("node:net");
    const answers = (port, host) => new Promise((resolve) => {
      const socket = net.connect({ port, host });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => resolve(false));
    });
    (async () => {
      for (let port = ${preferred}; port < ${preferred} + 100; port++) {
        if (!(await answers(port, "127.0.0.1")) && !(await answers(port, "::1"))) {
          process.stdout.write(String(port));
          return;
        }
      }
      process.exit(1);
    })();
  `;
  return Number(execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }));
}

/**
 * Resolves the port for an E2E server, falling back to the next free one (with a
 * note) when the preferred port is taken. The choice is cached in `process.env`
 * because Playwright re-evaluates its config in each worker, and workers inherit
 * the main process's env — so every evaluation agrees on the same port.
 */
export function resolveE2ePort(envVar: string, preferred: number, label: string): number {
  const cached = process.env[envVar];
  if (cached) return Number(cached);

  const port = findFreePortSync(preferred);
  if (port !== preferred) {
    console.log(`Note: port ${preferred} is in use, running ${label} on port ${port} instead.`);
  }
  process.env[envVar] = String(port);
  return port;
}
