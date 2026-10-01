const originalDescriptorsObjectMap = new WeakMap<Object, Record<PropertyKey, PropertyDescriptor | undefined>>();

/** A property's descriptor on `object` or, if it's inherited, on the nearest prototype that has it */
function findDescriptor(object: object, propName: PropertyKey): PropertyDescriptor | undefined {
  for (let current: object | null = object; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, propName);
    if (descriptor) return descriptor;
  }
  return undefined;
}

/** The value a descriptor gives `receiver`, whether it's a data or an accessor property */
function readDescriptor(descriptor: PropertyDescriptor | undefined, receiver: object): unknown {
  if (!descriptor) return undefined;
  return descriptor.get ? descriptor.get.call(receiver) : descriptor.value;
}

/**
 * Makes properties of `parentObject` read as something else until the returned cleanup function is called: either
 * another of its properties (by name) or a value computed from the property's own value (by function).
 *
 * The properties are redefined on `objectToModify`, which defaults to `parentObject` but can be a prototype it
 * inherits them from (e.g. `Element.prototype` for `document.body.clientWidth`). In that case only `parentObject` sees
 * the remapped values; other objects sharing the prototype keep reading the originals. Works for data and accessor
 * properties alike. Remaps of the same object can be nested and cleaned up in any order.
 */
export function propertyRemap<ObjectToModify extends object, ParentObject extends ObjectToModify>(
  parentObject: ParentObject,
  propertyMap: Partial<Record<keyof ObjectToModify, keyof ObjectToModify | ((originalValue: ObjectToModify[keyof ObjectToModify]) => ObjectToModify[keyof ObjectToModify])>>,
  objectToModify: ObjectToModify = parentObject
) {
  const propNames = Object.keys(propertyMap) as (keyof ObjectToModify)[];

  // We track the original descriptors for each object so we can be sure to restore them correctly no matter what
  // order the cleanup functions are called in. A property that wasn't the object's own (it was inherited) is tracked
  // as undefined, so cleanup deletes it rather than leaving a copy behind.
  if (!originalDescriptorsObjectMap.has(objectToModify)) {
    originalDescriptorsObjectMap.set(objectToModify, {});
  }
  const originalDescriptors = originalDescriptorsObjectMap.get(objectToModify)!;
  for (const propName of propNames) {
    if (!(propName in originalDescriptors)) {
      originalDescriptors[propName] = Object.getOwnPropertyDescriptor(objectToModify, propName);
    }
  }

  // We also need the descriptors as they are right before this remap (they may already be remapped) so that remaps
  // chain correctly. This includes the properties remapped to by name, so they're read as they were before the remap.
  const mappedToNames = Object.values(propertyMap).filter(
    (mapping): mapping is keyof ObjectToModify => typeof mapping !== "function"
  );
  const beforeRemapDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>(
    [...propNames, ...mappedToNames].map((propName) => [propName, findDescriptor(objectToModify, propName)])
  );

  for (const propName of propNames) {
    const mapping = propertyMap[propName];
    const beforeRemapDescriptor = beforeRemapDescriptors.get(propName);

    Object.defineProperty(objectToModify, propName, {
      configurable: true,
      enumerable: beforeRemapDescriptor?.enumerable ?? true,
      set: beforeRemapDescriptor?.set,
      get() {
        // Other objects sharing a modified prototype keep the original behaviour
        if (this !== parentObject) return readDescriptor(beforeRemapDescriptor, this);
        if (typeof mapping === "function") {
          let originalValue = readDescriptor(beforeRemapDescriptor, parentObject);
          // Methods are handed over bound, so they can be called on their own
          if (typeof originalValue === "function") originalValue = originalValue.bind(parentObject);
          return mapping.call(parentObject, originalValue as ObjectToModify[keyof ObjectToModify]);
        }
        return mapping === undefined
          ? undefined
          : readDescriptor(beforeRemapDescriptors.get(mapping), parentObject);
      },
    });
  }

  // return cleanup function to restore original properties
  return () => {
    for (const propName of propNames) {
      const originalDescriptor = originalDescriptors[propName];
      if (originalDescriptor) {
        Object.defineProperty(objectToModify, propName, originalDescriptor);
      } else {
        // The property was inherited, so removing the remap uncovers the original again
        Reflect.deleteProperty(objectToModify, propName);
      }
    }
  }
}
