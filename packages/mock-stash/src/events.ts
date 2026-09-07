/** Minimal promise-based async event emitter supporting GraphQL subscriptions. */

export interface EventEmitter<T> {
  emit(value: T): void;
  asyncIterator(): AsyncIterableIterator<T>;
}

export function createEventEmitter<T>(): EventEmitter<T> {
  const listeners = new Set<(value: T) => void>();

  return {
    emit(value: T) {
      for (const listener of [...listeners]) {
        listener(value);
      }
    },

    asyncIterator(): AsyncIterableIterator<T> {
      const pendingValues: T[] = [];
      const pendingResolves: ((result: IteratorResult<T>) => void)[] = [];
      let done = false;

      const listener = (value: T) => {
        const resolve = pendingResolves.shift();
        if (resolve) {
          resolve({ value, done: false });
        } else {
          pendingValues.push(value);
        }
      };
      listeners.add(listener);

      return {
        next(): Promise<IteratorResult<T>> {
          if (pendingValues.length > 0) {
            return Promise.resolve({ value: pendingValues.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined as never, done: true });
          }
          return new Promise<IteratorResult<T>>((resolve) => {
            pendingResolves.push(resolve);
          });
        },
        return(): Promise<IteratorResult<T>> {
          done = true;
          listeners.delete(listener);
          for (const resolve of pendingResolves) {
            resolve({ value: undefined as never, done: true });
          }
          pendingResolves.length = 0;
          return Promise.resolve({ value: undefined as never, done: true });
        },
        throw(error: unknown): Promise<IteratorResult<T>> {
          done = true;
          listeners.delete(listener);
          return Promise.reject(error);
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  };
}
