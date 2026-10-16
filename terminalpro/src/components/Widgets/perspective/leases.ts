export interface Lease<T> {
  resource: T;
  release(): Promise<void>;
}

export function createLeasePool<T extends { terminate(): Promise<void> }>(
  factory: () => Promise<T>,
) {
  let resource: T | undefined;
  let count = 0;
  let tail = Promise.resolve();
  function serialize<R>(action: () => Promise<R>): Promise<R> {
    const result = tail.then(action);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  return {
    acquire(): Promise<Lease<T>> {
      return serialize(async () => {
        resource ??= await factory();
        count += 1;
        const owned = resource;
        let released: Promise<void> | undefined;
        return {
          resource: owned,
          release() {
            released ??= serialize(async () => {
              count -= 1;
              if (count === 0) {
                resource = undefined;
                await owned.terminate();
              }
            });
            return released;
          },
        };
      });
    },
  };
}
