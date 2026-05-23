export const PACE_REFRESH_INTERVAL_MS = 10_000;

export const paceRefreshQueryOptions = {
  refetchInterval: PACE_REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: true,
} as const;
