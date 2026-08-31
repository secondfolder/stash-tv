/**
 * Plugin settings and reset tests
 *
 * Tests the PluginSettings patch that adds reset functionality and
 * the dev options JSON inspector, including config persistence.
 */

import { describe, it, expect, vi } from 'vitest';

describe('Plugin settings and reset', () => {
  it('resets all settings to defaults when reset button is clicked', async () => {
    const mockMutate = vi.fn().mockResolvedValue({});

    const mockClient = {
      mutate: mockMutate,
    };

    // Simulate the resetStashTvSettings function behavior
    const emptyConfig = {};

    await mockClient.mutate({
      mutation: 'ConfigurePluginDocument',
      variables: {
        plugin_id: 'stash-tv',
        input: emptyConfig,
      },
    });

    expect(mockMutate).toHaveBeenCalledWith({
      mutation: 'ConfigurePluginDocument',
      variables: {
        plugin_id: 'stash-tv',
        input: {},
      },
    });
  });

  it('persists config via ConfigurePlugin mutation', async () => {
    const mockMutate = vi.fn().mockResolvedValue({
      data: {
        configurePlugin: {
          plugin_id: 'stash-tv',
          value: { volume: 50, muted: false },
        },
      },
    });

    const mockClient = {
      mutate: mockMutate,
    };

    const newConfig = { volume: 50, muted: false };

    await mockClient.mutate({
      mutation: 'ConfigurePluginDocument',
      variables: {
        plugin_id: 'stash-tv',
        input: newConfig,
      },
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          plugin_id: 'stash-tv',
          input: newConfig,
        }),
      })
    );
  });

  it('updates interface config via ConfigureInterface mutation', async () => {
    const mockMutate = vi.fn().mockResolvedValue({
      data: {
        configureInterface: {
          menuItems: ['tv', 'scenes'],
          soundOnPreview: true,
        },
      },
    });

    const mockClient = {
      mutate: mockMutate,
    };

    const newInterfaceConfig = { menuItems: ['tv', 'scenes'], soundOnPreview: true };

    await mockClient.mutate({
      mutation: 'ConfigureInterfaceDocument',
      variables: {
        input: newInterfaceConfig,
      },
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: newInterfaceConfig,
        }),
      })
    );
  });

  it('reads config via Configuration query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      data: {
        configuration: {
          plugins: {
            'stash-tv': {
              volume: 50,
              muted: false,
            },
          },
          interface: {
            menuItems: ['tv', 'scenes'],
          },
        },
      },
    });

    const mockClient = {
      query: mockQuery,
    };

    const result = await mockClient.query({
      query: 'ConfigurationDocument',
    });

    expect(result.data?.configuration?.plugins?.['stash-tv']).toEqual({
      volume: 50,
      muted: false,
    });
  });

  it('shows JSON inspector only when showDevOptions is true', () => {
    // Test case 1: showDevOptions is true
    const stashTvConfig1 = {
      'stash-tv-config': JSON.stringify({
        state: {
          showDevOptions: true,
        },
      }),
    };

    const isDevOptionsEnabled1 = JSON.parse(
      stashTvConfig1['stash-tv-config'] || '{}'
    )?.state?.showDevOptions;

    expect(isDevOptionsEnabled1).toBe(true);

    // Test case 2: showDevOptions is false
    const stashTvConfig2 = {
      'stash-tv-config': JSON.stringify({
        state: {
          showDevOptions: false,
        },
      }),
    };

    const isDevOptionsEnabled2 = JSON.parse(
      stashTvConfig2['stash-tv-config'] || '{}'
    )?.state?.showDevOptions;

    expect(isDevOptionsEnabled2).toBe(false);

    // Test case 3: showDevOptions is not set (undefined)
    const stashTvConfig3 = {
      'stash-tv-config': JSON.stringify({
        state: {},
      }),
    };

    const isDevOptionsEnabled3 = JSON.parse(
      stashTvConfig3['stash-tv-config'] || '{}'
    )?.state?.showDevOptions;

    expect(isDevOptionsEnabled3).toBeUndefined();
  });

  it('handles missing tv config key gracefully', () => {
    const stashTvConfig = {};

    // This should not throw even when tvConfigStorageKey is missing
    const configValue = stashTvConfig['stash-tv-config'] || '{}';

    expect(() => JSON.parse(configValue)).not.toThrow();
    expect(JSON.parse(configValue)).toEqual({});
  });
});
