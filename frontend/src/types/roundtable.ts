export type Budget = 'budget' | 'mid' | 'splurge'

export type UserConstraints = {
  name: string
  budget: Budget
  dietary: string
  mood: string
  time: string
  lat: number | null
  lng: number | null
}

export type VenueSlot = {
  slot: 'pre_drinks' | 'dinner' | 'bar'
  venue_id: string
  venue_name: string
  address: string
  lat: number
  lng: number
  reason: string
}

export type ItineraryResult = {
  venues: VenueSlot[]
  summary: string
  round: number
}

export type PhaseEvent = {
  phase: 'research' | 'proposals' | 'voting' | 'verdict'
  round: number
}

export type ThinkingEvent = {
  agent_id: string
  thinking: boolean
}

export type AgentMessage = {
  agent_id: string
  agent_name: string
  round: number
  content: string
  type: 'proposal' | 'vote' | 'objection' | 'summary'
}

export type ResultEvent = {
  itinerary: ItineraryResult
}

export type ErrorEvent = {
  message: string
}

export type AgentColumn = {
  agent_id: string
  name: string
  thinking: boolean
  messages: AgentMessage[]
}

export type SessionStatus = {
  chatId: string
  inviteToken: string
  invitePath: string
  status: 'waiting_for_constraints' | 'negotiating' | 'completed' | 'failed'
  title: string | null
  expectedParticipantCount: number
  participantCount: number
  submittedConstraintsCount: number
  waitingForConstraintsCount: number
  createdAtUtc: string
  joinDeadlineUtc: string
  startedAtUtc: string | null
  completedAtUtc: string | null
  roundtableSessionId: string | null
  finalItineraryJson: string | null
  failureReason: string | null
  participants: SessionParticipant[]
}

export type SessionParticipant = {
  userId: string
  email: string | null
  displayName: string | null
  hasSubmittedConstraints: boolean
  joinedAtUtc: string
  constraintsSubmittedAtUtc: string | null
}
