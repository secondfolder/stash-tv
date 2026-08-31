/**
 * E2E test helper for starting mock-stash and dev servers
 */

import { ChildProcess, spawn } from 'child_process';
import * as http from 'http';

let mockStashProcess: ChildProcess | null = null;
let devServerProcess: ChildProcess | null = null;

/**
 * Wait for a server to start responding on a given port
 */
function waitForServer(port: number, maxWait = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkServer = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          resolve();
        } else {
          retry();
        }
      });

      req.on('error', retry);
      req.setTimeout(5000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime > maxWait) {
        reject(new Error(`Server on port ${port} did not start within ${maxWait}ms`));
        return;
      }
      setTimeout(checkServer, 500);
    };

    checkServer();
  });
}

/**
 * Start the mock-stash server
 */
export async function startMockStashServer(): Promise<void> {
  if (mockStashProcess) {
    console.log('Mock stash server already running');
    return;
  }

  console.log('Starting mock-stash server...');
  mockStashProcess = spawn('node', ['e2e-server.mjs'], {
    cwd: '../../packages/mock-stash',
    stdio: 'pipe',
  });

  mockStashProcess.stdout?.on('data', (data) => {
    console.log(`[mock-stash] ${data.toString().trim()}`);
  });

  mockStashProcess.stderr?.on('data', (data) => {
    console.error(`[mock-stash] ${data.toString().trim()}`);
  });

  mockStashProcess.on('error', (err) => {
    console.error('Failed to start mock-stash server:', err);
    throw err;
  });

  await waitForServer(4000);
  console.log('Mock stash server started on port 4000');
}

/**
 * Start the dev server with STASH_PROXY
 */
export async function startDevServer(): Promise<void> {
  if (devServerProcess) {
    console.log('Dev server already running');
    return;
  }

  console.log('Starting dev server...');
  devServerProcess = spawn('yarn', ['dev'], {
    cwd: '../../packages/tv-ui',
    stdio: 'pipe',
    env: {
      ...process.env,
      STASH_ADDRESS: 'http://localhost:4000',
      STASH_PROXY: 'true',
      DEV_PORT: '8888',
    },
  });

  devServerProcess.stdout?.on('data', (data) => {
    console.log(`[dev-server] ${data.toString().trim()}`);
  });

  devServerProcess.stderr?.on('data', (data) => {
    console.error(`[dev-server] ${data.toString().trim()}`);
  });

  devServerProcess.on('error', (err) => {
    console.error('Failed to start dev server:', err);
    throw err;
  });

  await waitForServer(8888);
  console.log('Dev server started on port 8888');
}

/**
 * Stop both servers
 */
export async function stopServers(): Promise<void> {
  if (mockStashProcess) {
    console.log('Stopping mock-stash server...');
    mockStashProcess.kill('SIGTERM');
    mockStashProcess = null;
  }

  if (devServerProcess) {
    console.log('Stopping dev server...');
    devServerProcess.kill('SIGTERM');
    devServerProcess = null;
  }
}
