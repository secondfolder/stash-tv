declare module '@popperjs/core/dist/esm/utils/getBasePlacement' {
  import type { Placement, BasePlacement } from '@popperjs/core';
  export default function getBasePlacement(placement: Placement): BasePlacement;
}

declare module '@popperjs/core/dist/esm/utils/getMainAxisFromPlacement' {
  import type { BasePlacement } from '@popperjs/core';
  export default function getMainAxisFromPlacement(placement: BasePlacement): 'x' | 'y';
}
