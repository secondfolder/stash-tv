/**
 * Mock PluginApi for tv-plugin testing
 *
 * Simulates the Stash PluginApi interface that the plugin code expects
 * to find at window.PluginApi. This includes React, libraries, GQL hooks,
 * patch registration, and configuration utilities.
 */

import { vi, expect } from 'vitest';

/**
 * Type for the mocked PluginApi
 */
export interface PluginApiMock {
  React: any;
  libraries: {
    Bootstrap: {
      Button: any;
    };
    FontAwesomeSolid: {
      faCheck: any;
      faTelevision: any;
    };
  };
  utils: {
    StashService: {
      getClient: ReturnType<typeof vi.fn>;
    };
  };
  GQL: {
    useConfigurationQuery: any;
    ConfigurePluginDocument: any;
    ConfigureInterfaceDocument: any;
    ConfigurationDocument: any;
  };
  patch: {
    instead: ReturnType<typeof vi.fn>;
    before: ReturnType<typeof vi.fn>;
  };
  ReactModule: {
    useState: any;
    useEffect: any;
    useMemo: any;
  };
}

/**
 * Creates a mock React module that can be used by the plugin code
 */
function createMockReact() {
  const useState = vi.fn();
  const useEffect = vi.fn();
  const useMemo = vi.fn();

  return {
    useState,
    useEffect,
    useMemo,
    // Basic mock for createElement (React.createElement is used internally)
    createElement: vi.fn((type: any, props: any, ...children: any[]) => ({
      type,
      props: { ...props, children },
    })),
  };
}

/**
 * Creates a mock for GQL hooks and documents
 */
function createMockGQL() {
  const useConfigurationQuery = vi.fn();
  const ConfigurePluginDocument = 'ConfigurePluginDocument';
  const ConfigureInterfaceDocument = 'ConfigureInterfaceDocument';
  const ConfigurationDocument = 'ConfigurationDocument';

  return {
    useConfigurationQuery,
    ConfigurePluginDocument,
    ConfigureInterfaceDocument,
    ConfigurationDocument,
  };
}

/**
 * Creates a mock Bootstrap library
 */
function createMockBootstrap() {
  const Button = vi.fn(({ children, onClick, variant }) => ({
    type: 'button',
    props: { children, onClick, variant },
  }));

  return { Button };
}

/**
 * Creates a mock for FontAwesomeSolid icons
 */
function createMockFontAwesomeSolid() {
  return {
    faCheck: { iconName: 'check', prefix: 'fas' },
    faTelevision: { iconName: 'television', prefix: 'fas' },
  };
}

/**
 * Creates a mock for StashService.getClient that returns a mocked Apollo client
 */
function createMockStashService() {
  const mockClient = {
    query: vi.fn(),
    mutate: vi.fn(),
  };

  const getClient = vi.fn(() => mockClient);

  return {
    getClient,
    mockClient,
  };
}

/**
 * Creates the complete PluginApi mock
 */
export function createPluginApiMock(): PluginApiMock {
  const mockReact = createMockReact();
  const mockGQL = createMockGQL();
  const mockBootstrap = createMockBootstrap();
  const mockFontAwesomeSolid = createMockFontAwesomeSolid();
  const mockStashService = createMockStashService();

  // Track patches registered by the plugin
  const patches: Record<string, any[]> = {};

  const patch = {
    instead: vi.fn((target: string, implementation: Function) => {
      if (!patches[target]) {
        patches[target] = [];
      }
      patches[target].push({ type: 'instead', implementation });
    }),
    before: vi.fn((target: string, implementation: Function) => {
      if (!patches[target]) {
        patches[target] = [];
      }
      patches[target].push({ type: 'before', implementation });
    }),
  };

  return {
    React: mockReact,
    ReactModule: mockReact, // Alias for PluginApi.React
    libraries: {
      Bootstrap: mockBootstrap,
      FontAwesomeSolid: mockFontAwesomeSolid,
    },
    utils: {
      StashService: mockStashService,
    },
    GQL: mockGQL,
    patch,
    // Expose internals for test assertions
    _mocks: {
      react: mockReact,
      gql: mockGQL,
      bootstrap: mockBootstrap,
      fontAwesome: mockFontAwesomeSolid,
      stashService: mockStashService,
      patches,
    },
  };
}

/**
 * Helper to reset all mock call histories
 */
export function resetPluginApiMocks(mockPluginApi: PluginApiMock) {
  const { _mocks } = mockPluginApi as any;
  _mocks.react.useState.mockClear();
  _mocks.react.useEffect.mockClear();
  _mocks.react.useMemo.mockClear();
  _mocks.gql.useConfigurationQuery.mockClear();
  _mocks.utils.StashService.getClient.mockClear();
  _mocks.utils.StashService.getClient().query.mockClear();
  _mocks.utils.StashService.getClient().mutate.mockClear();
  _mocks.patch.instead.mockClear();
  _mocks.patch.before.mockClear();
}

/**
 * Helper to assert that a patch was registered
 */
export function assertPatchRegistered(
  mockPluginApi: PluginApiMock,
  target: string,
  type: 'instead' | 'before'
) {
  const { _mocks } = mockPluginApi as any;
  const targetPatches = _mocks.patches[target];

  if (!targetPatches) {
    throw new Error(`No patches registered for target: ${target}`);
  }

  const hasExpectedPatch = targetPatches.some((p: any) => p.type === type);
  expect(hasExpectedPatch).toBe(true);
}
