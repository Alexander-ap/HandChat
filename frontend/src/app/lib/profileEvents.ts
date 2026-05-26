export const PROFILE_STATS_REFRESH_EVENT = "profile-stats-refresh"

export function notifyProfileStatsRefresh(delta?: { postCount?: number }) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PROFILE_STATS_REFRESH_EVENT, { detail: delta }))
}
