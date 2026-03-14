export type ActivityResponse = {
  id: string
  title: string | null
  distanceMeters: number
  durationSeconds: number
  estimatedCalories: number
  source: string
  startedAtUtc: string
  completedAtUtc: string
  routeSummaryJson?: string | null
}

export type ProfileSummary = {
  totalDistanceMeters: number
  totalDurationSeconds: number
  totalEstimatedCalories: number
  activityCount: number
  longestDistanceMeters: number
  recentActivities: ActivityResponse[]
}

export type CreateActivityRequest = {
  title?: string | null
  distanceMeters: number
  durationSeconds: number
  routeSummaryJson?: string | null
  source?: string | null
}
