import type { UseQueryOptions } from "@tanstack/react-query";

/** Keep the mounted table/chart through a refresh, never across source or parser changes. */
export function fileRefreshOptions<T>(
  identity: readonly unknown[],
): Pick<UseQueryOptions<T>, "meta" | "placeholderData"> {
  const fileSourceIdentity = JSON.stringify(identity);
  return {
    meta: { fileSourceIdentity },
    placeholderData: (previous, query) =>
      query?.meta?.fileSourceIdentity === fileSourceIdentity &&
      query.state.status === "success"
        ? previous
        : undefined,
  };
}
