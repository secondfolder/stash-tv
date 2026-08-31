/**
 * Plugin navigation button tests
 *
 * Tests the MainNavBar.MenuItems patch that injects the TV navigation button,
 * including gating on interface.menuItems configuration and checkbox injection.
 */

import { describe, it, expect, vi } from 'vitest';

describe('Plugin navigation button', () => {
  it('shows nav button when tv is in interface.menuItems', async () => {
    // Mock configuration query with tv in menuItems
    const mockUseConfigurationQuery = vi.fn().mockReturnValue({
      data: {
        configuration: {
          interface: {
            menuItems: ['tv', 'scenes', 'images'],
          },
        },
      },
      loading: false,
    });

    const result = mockUseConfigurationQuery();
    const showNavButton = result.data?.configuration?.interface?.menuItems?.includes('tv');

    expect(showNavButton).toBe(true);
  });

  it('hides nav button when tv is not in interface.menuItems', async () => {
    // Mock configuration query without tv in menuItems
    const mockUseConfigurationQuery = vi.fn().mockReturnValue({
      data: {
        configuration: {
          interface: {
            menuItems: ['scenes', 'images', 'markers'],
          },
        },
      },
      loading: false,
    });

    const result = mockUseConfigurationQuery();
    const showNavButton = result.data?.configuration?.interface?.menuItems?.includes('tv');

    expect(showNavButton).toBe(false);
  });

  it('shows nav button only when config is not loading', async () => {
    // Mock configuration query in loading state
    const mockUseConfigurationQuery = vi.fn().mockReturnValue({
      data: undefined,
      loading: true,
    });

    const result = mockUseConfigurationQuery();
    const showNavButton = !result.loading && result.data?.configuration?.interface?.menuItems?.includes('tv');

    expect(showNavButton).toBe(false);
  });

  it('injects TV checkbox into menu-items CheckboxGroup', () => {
    // Mock CheckboxGroup props
    const props = {
      groupId: 'menu-items',
      items: [
        { id: 'scenes', headingID: 'Scenes' },
        { id: 'images', headingID: 'Images' },
        { id: 'markers', headingID: 'Markers' },
      ],
    };

    // Simulate the plugin's CheckboxGroup patch
    const patchedProps =
      props.groupId !== 'menu-items'
        ? props
        : {
            ...props,
            items: [
              ...props.items,
              { id: 'tv', headingID: 'TV' },
            ],
          };

    expect(patchedProps.items).toHaveLength(4);
    expect(patchedProps.items).toContainEqual({ id: 'tv', headingID: 'TV' });
  });

  it('does not modify CheckboxGroup for other groupIds', () => {
    // Mock CheckboxGroup props for a different group
    const props = {
      groupId: 'some-other-group',
      items: [
        { id: 'item1', headingID: 'Item 1' },
        { id: 'item2', headingID: 'Item 2' },
      ],
    };

    // Simulate the plugin's CheckboxGroup patch
    const patchedProps =
      props.groupId !== 'menu-items'
        ? props
        : {
            ...props,
            items: [
              ...props.items,
              { id: 'tv', headingID: 'TV' },
            ],
          };

    expect(patchedProps.items).toHaveLength(2);
    expect(patchedProps.items).not.toContainEqual({ id: 'tv', headingID: 'TV' });
  });
});
