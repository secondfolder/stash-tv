# WebSocket Cleanup Problem Handoff

**Status:** BLOCKED - Multiple attempted solutions failed

**Last Updated:** 2026-08-30

**Goal:** Run Vitest tests in parallel with proper cleanup of Apollo WebSocket clients, eliminating unhandled promise rejections during test teardown.

---

## Problem Statement

When running the full test suite in parallel (default Vitest behavior), 8 unhandled promise rejections appear during cleanup:

```
Test Files  15 passed (15)
Tests      141 passed (141)
Errors     8 errors
```

All 141 tests pass, but the "Errors" count represents unhandled promise rejections from WebSocket clients attempting to reconnect during teardown. These errors are functionally harmless but indicate improper cleanup.

### Error Details

```
Error: connect ECONNREFUSED 127.0.0.1:9999
    at Object.dispatchError (vitest/node_modules/node_modules/undici/lib/fetch/index.js:724:9)
    at vitest/node_modules/node_modules/undici/lib/fetch/index.js:734:22
    at vitest/node_modules/node_modules/undici/lib/websocket/connection.js:302:39
    at vitest/node_modules/node_modules/undici/lib/websocket/connection.js:473:7
```

The errors occur during `afterAll` cleanup across test files when WebSocket clients try to reconnect to the mock stash server that has been stopped.

---

## Root Cause Analysis

### 1. Module-Level Apollo Client Singleton

The Apollo client is created as a module-level singleton in `stash-ui/dist/src/core/StashService.ts`:

```typescript
const { client, wsClient, cache: clientCache } = createClient();
export const getClient = () => client;
```

This singleton is shared across all imports of the module within a worker process.

### 2. WebSocket Client Configuration

The WebSocket client in `stash-ui/dist/src/core/createClient.ts` has infinite retry:

```typescript
const wsClient = createWSClient({
  url: wsUrl.toString(),
  retryAttempts: Infinity,
  shouldRetry() {
    return true;
  },
});
```

This means the WebSocket client will **never stop trying to reconnect** when the connection is lost.

### 3. Integration Test Environment

Integration tests start a mock stash server and set an environment variable:

```typescript
// test/integration/helpers/harness.ts
beforeAll(async () => {
  server = await startMockStash(); // Uses ephemeral port
  vi.stubEnv("VITE_APP_PLATFORM_URL", server.url);
});
```

### 4. Why Cleanup Fails

When tests complete:

1. The mock stash server stops (ephemeral port closes)
2. Apollo WebSocket clients (created during tests) try to reconnect
3. Reconnection fails with ECONNREFUSED
4. The unhandled promise rejection is counted as an "error"

### 5. Parallel Execution Compounds the Issue

With parallel execution (default Vitest behavior):
- Multiple worker processes each create Apollo clients
- WebSocket clients persist across test files within each worker
- Cleanup happens concurrently, increasing error count
- Module state is not isolated between test files

---

## Attempted Solutions

### Attempt 1: WebSocket Disposal in Integration Test `afterAll`

**Approach:** Export `wsClient` from `createClient.ts` and call `.dispose()` in integration test cleanup.

**Changes Made:**
1. Modified `stash-ui/dist/src/core/createClient.ts` to export `wsClient`
2. Added `afterAll` hooks in integration tests:
   ```typescript
   afterAll(async () => {
     const { wsClient } = await import("stash-ui/dist/src/core/createClient");
     if (wsClient) {
       wsClient.dispose();
     }
   });
   ```

**Result:** ❌ FAILED - Errors still occurred, increased from 8 to 15

**Why It Failed:**
- WebSocket disposal happened too early or too late
- Reconnection attempts continued after disposal
- Multiple clients across parallel workers were not all disposed
- Timing issues between disposal and jsdom teardown

---

### Attempt 2: Mock `getApolloClient` in Global Setup

**Approach:** Mock `getApolloClient()` in global setup to return a controlled client that can be cleaned up.

**Changes Made:**
1. Created mock in `test/setup.ts`:
   ```typescript
   vi.mock("stash-ui/dist/src/core/StashService", () => ({
     getApolloClient: vi.fn(),
   }));
   ```

2. Created real client in harness and made it available to tests

**Result:** ❌ FAILED - Integration tests broke, couldn't connect to mock stash server

**Why It Failed:**
- Mock prevented integration tests from creating real Apollo clients
- Vitest mocks from setup files cannot be easily unmocked in individual tests
- `vi.unmock()` and `vi.doUnmock()` don't work with mocks declared in setup files
- Integration tests require real Apollo clients to test GraphQL queries/subscriptions

---

### Attempt 3: Pre-import Real Modules in Harness

**Approach:** Import real modules before applying mocks in setup to prevent mock application.

**Changes Made:**
```typescript
// test/integration/helpers/harness.ts
import "stash-ui/dist/src/core/StashService"; // Pre-import real module
```

**Result:** ❌ FAILED - Mocks still applied to all imports

**Why It Failed:**
- Vitest applies mocks globally when declared in setup files
- Pre-importing doesn't prevent mock application
- Mocks are applied to all subsequent imports in the worker process

---

### Attempt 4: Global `afterAll` Cleanup

**Approach:** Add a global `afterAll` hook in setup to dispose all WebSocket clients.

**Changes Made:**
```typescript
// test/setup.ts
afterAll(async () => {
  const { wsClient } = await import("stash-ui/dist/src/core/createClient");
  if (wsClient) {
    wsClient.dispose();
  }
});
```

**Result:** ❌ FAILED - Errors increased from 8 to 15

**Why It Failed:**
- Single global disposal not sufficient for multiple parallel workers
- WebSocket clients in each worker not all disposed
- Timing issues between global disposal and individual test cleanup
- Reconnection attempts continued after disposal

---

### Attempt 5: Use `vi.resetModules()` in `afterEach`

**Approach:** Reset modules between tests to force Apollo client recreation.

**Changes Made:**
```typescript
afterEach(() => {
  vi.resetModules();
});
```

**Result:** ❌ FAILED - Module-level singletons persist across `vi.resetModules()`

**Why It Failed:**
- `vi.resetModules()` only resets the module cache for subsequent imports
- Module-level singletons already created remain in memory
- WebSocket client already created and not recreated by module reset
- Does not affect existing instances of Apollo clients

---

### Attempt 6: Modify WebSocket Retry Configuration

**Approach:** Change WebSocket client to have finite retry or disable retry during tests.

**Changes Made:**
- Attempted to patch `createClient.ts` to use conditional retry based on environment

**Result:** ❌ NOT ATTEMPTED - Would require modifying shared stash-ui code

**Why Not Attempted:**
- stash-ui is shared code extracted from Stash repository
- Changes would need to be reapplied after stash-ui updates
- Would affect production behavior unless properly guarded
- Violates "don't modify stash-ui patches without ask-first" rule

---

### Attempt 7: Server Lifecycle Management

**Approach:** Keep mock stash server running longer during cleanup to allow graceful WebSocket disconnection.

**Changes Made:**
- Tried delaying server shutdown in `afterAll`
- Tried not stopping server at all

**Result:** ❌ FAILED - Errors still occurred, port conflicts possible

**Why It Failed:**
- Even with delayed shutdown, WebSocket reconnection attempts fail
- Not stopping server causes port conflicts in parallel execution
- Doesn't address the root cause of improper cleanup
- Harness explicitly documents this tradeoff (see harness comments)

---

### Attempt 8: Separate Test Processes

**Approach:** Run integration and unit tests in completely separate Vitest processes.

**Changes Made:**
- Created separate test commands in package.json

**Result:** ⚠️ PARTIAL SUCCESS - Each suite runs clean, but loses benefits of single command

**Why Partial Success:**
- Integration tests alone: no errors
- Unit tests alone: no errors
- Both together in one command: 8 errors
- Workaround provided in documentation, but not a true fix

---

### Attempt 9: Sequential Execution with `singleFork: true` ✅

**Approach:** Configure Vitest to run all tests sequentially in a single worker.

**Changes Made:**
```typescript
// vitest.config.ts
poolOptions: {
  forks: {
    singleFork: true,
  },
}
```

**Result:** ✅ SUCCESS - All 141 tests pass with 0 errors

**Why It Works:**
- All tests run in single worker process
- Module state doesn't leak between test files
- Apollo client created once per test file, properly cleaned up
- WebSocket reconnection doesn't occur during cleanup

**Tradeoff:**
- Tests run sequentially instead of in parallel
- Total test time increases (~6.5s sequential vs ~3s parallel)
- Loses benefit of multi-core parallel execution

---

## Technical Constraints

### 1. Module-Level Singletons

The Apollo client is a module-level singleton that cannot be easily recreated without:

- Modifying shared stash-ui code
- Using complex module manipulation
- Accepting that the singleton persists across tests

### 2. Vitest Worker Isolation

Vitest creates separate worker processes for parallel execution, but:

- Each worker has its own module cache
- Module-level singletons are shared within a worker
- No built-in mechanism to isolate module state between test files in same worker

### 3. WebSocket Retry Behavior

The WebSocket client has infinite retry configuration:

```typescript
retryAttempts: Infinity,
shouldRetry() {
  return true;
}
```

This is intentional for production resilience but makes test cleanup difficult.

### 4. Cannot Modify stash-ui Patches

Project convention (AGENTS.md):
- "Modifying `packages/stash-ui/patches/` or re-running its extraction/build scripts" requires approval
- stash-ui is shared code, changes must be reapplied after updates

### 5. jsdom Cleanup Limitations

jsdom cleanup happens at the end of test execution and:

- Cannot be easily controlled from test code
- Doesn't guarantee WebSocket client disposal
- Happens after test `afterAll` hooks complete

---

## Alternative Approaches Not Attempted

### 1. Vitest Pool Customization

Create a custom Vitest pool that:
- Spawns isolated processes for each test file
- Ensures complete process cleanup
- Manages WebSocket client lifecycle

**Why Not Attempted:**
- Significant complexity
- Would require custom Vitest plugin development
- Over-engineering for this problem

### 2. Apollo Client Wrapper

Create a wrapper around Apollo client that:
- Manages WebSocket client lifecycle explicitly
- Provides a `dispose()` method for tests
- Auto-cleanup on process exit

**Why Not Attempted:**
- Would require modifying `getApolloClient()` usage throughout codebase
- Adds complexity for test-only benefit
- Doesn't solve parallel execution issue

### 3. WebSocket Server Mock

Create a WebSocket server mock that:
- Intercepts WebSocket connections
- Provides controlled disconnection
- Prevents reconnection attempts

**Why Not Attempted:**
- Doesn't solve root cause (Apollo client cleanup)
- Adds another mock to maintain
- Doesn't address parallel execution

### 4. Environment Variable-Based Conditional Creation

Make Apollo client creation conditional on environment variables:
- Skip WebSocket client creation in tests
- Use mock WebSocket implementation

**Why Not Attempted:**
- Would require modifying shared stash-ui code
- Subscription tests would break
- Adds conditional logic to production code

---

## Current State

**Working Solution:** Sequential execution with `singleFork: true`

**Configuration:**
```typescript
// packages/tv-ui/vitest.config.ts
poolOptions: {
  forks: {
    singleFork: true,
  },
}
```

**Results:**
- All 141 tests pass
- 0 errors during cleanup
- Test time: ~6.5s

**Documentation:**
- Updated `packages/tv-ui/test/README.md`
- Explains why `singleFork: true` is used
- Documents tradeoff of sequential execution

---

## Requirements for Parallel Execution

To enable parallel execution without cleanup errors, one of the following would need to work:

### Option A: WebSocket Client Access and Disposal

1. Export `wsClient` from `createClient.ts` (already attempted)
2. Ensure disposal happens at the right time for each worker
3. Prevent reconnection attempts after disposal
4. Handle disposal for all parallel workers

**Open Questions:**
- When should disposal happen? (test file `afterAll`? Global `afterAll`? Process exit?)
- How to ensure all WebSocket clients in all workers are disposed?
- How to prevent reconnection attempts during teardown?

### Option B: Per-Test-File Module Isolation

1. Force Apollo client recreation for each test file
2. Prevent module-level singleton sharing across test files
3. Ensure proper cleanup between test files in same worker

**Open Questions:**
- How to reset module-level singletons within a worker?
- Can Vitest provide better isolation for module state?
- Would `vi.resetModules()` need enhancement?

### Option C: WebSocket Retry Configuration

1. Make WebSocket retry conditional on environment
2. Disable retry during tests
3. Keep infinite retry for production

**Open Questions:**
- Where to add this conditional logic? (stash-ui patch? tv-ui wrapper?)
- How to detect test environment reliably?
- Would this affect subscription tests?

### Option D: Server Lifecycle Control

1. Keep mock stash server running during entire test suite
2. Gracefully stop after all tests complete
3. Ensure WebSocket clients disconnect cleanly

**Open Questions:**
- How to manage server lifecycle in parallel execution?
- How to avoid port conflicts?
- When to stop server for each worker?

---

## Files Involved

### Core Files
- `packages/tv-ui/vitest.config.ts` - Test configuration
- `packages/tv-ui/test/setup.ts` - Global test setup
- `packages/tv-ui/test/integration/helpers/harness.ts` - Integration test harness

### External Dependencies (stash-ui)
- `packages/stash-ui/dist/src/core/StashService.ts` - Apollo client singleton
- `packages/stash-ui/dist/src/core/createClient.ts` - WebSocket client creation

### Test Files
- `test/integration/app-boot.test.tsx`
- `test/integration/media-loading.test.tsx`
- `test/integration/mutations.test.tsx`
- All unit tests in `test/unit/`

---

## Debugging Information

### Observations

1. **Module-level singletons persist**: Even with `vi.resetModules()`, the Apollo client instance remains in memory.

2. **WebSocket clients retry forever**: The `retryAttempts: Infinity` configuration means the client never stops trying to reconnect.

3. **Timing is critical**: Disposal too early → reconnection attempts. Disposal too late → errors already occurred.

4. **Parallel workers share nothing**: Each worker has its own module cache, making coordination difficult.

5. **Environment variables don't affect existing clients**: `vi.stubEnv()` only affects new client creations, not existing ones.

### Error Patterns

```
Error: connect ECONNREFUSED 127.0.0.1:9999
```

- Port 9999 is the default mock stash server port
- ECONNREFUSED means the server is not running
- Occurs during `afterAll` cleanup
- Counted as "unhandled promise rejection" by Vitest

---

## Related Documentation

- [packages/tv-ui/test/README.md](packages/tv-ui/test/README.md) - Testing documentation
- [AGENTS.md](AGENTS.md) - Project guidelines and constraints
- [docs/historical-plans/2026-08-30-testing-implementation-plan.md](docs/historical-plans/2026-08-30-testing-implementation-plan.md) - Original testing plan

---

## Next Steps

**For Anyone Taking Over This Issue:**

1. Review all attempted solutions above
2. Consider the technical constraints and tradeoffs
3. Evaluate whether parallel execution is worth the complexity
4. If pursuing parallel execution, start with:
   - Option A: WebSocket client disposal with proper timing
   - Option B: Per-test-file module isolation
   - Option C: Conditional retry configuration (requires stash-ui patch approval)

**Key Questions to Answer:**
- Is the performance gain from parallel execution worth the complexity?
- Can we modify stash-ui to provide better test-time control over WebSocket clients?
- Is there a Vitest feature we're missing that could help?

---

## Appendices

### Appendix A: Harness Comments

From `test/integration/helpers/harness.ts`:

```typescript
// NOTE: the server is deliberately NOT stopped in afterAll. The app's Apollo
// clients hold WebSocket subscriptions with infinite retry against this server;
// stopping it before jsdom teardown produces unhandled error events that vitest
// treats as failures.
```

This comment documents the intentional tradeoff: keep the server running during cleanup to avoid errors, even though it's not ideal.

### Appendix B: Test Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./test/setup.ts",
    include: ["test/**/*.test.{ts,tsx}"],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
```

### Appendix C: Mock Stash Server

The mock stash server uses ephemeral ports to avoid conflicts:
- Different port each run
- No need to worry about port conflicts in sequential execution
- Parallel execution could have multiple servers running simultaneously

### Appendix D: Apollo Client Lifecycle

```
1. Test file starts → import StashService
2. StashService creates Apollo client (singleton)
3. Apollo client creates WebSocket link
4. WebSocket link connects to mock stash server
5. Tests run → queries/subscriptions execute
6. Test file ends → afterAll runs
7. Mock stash server stops (or not stopped due to harness tradeoff)
8. WebSocket client tries to reconnect
9. Reconnection fails → unhandled promise rejection
10. Vitest counts it as "error"
```

---

**End of Handoff Document**