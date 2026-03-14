export type Budget = 'budget' | 'mid' | 'splurge'

export type UserConstraints = {
  name: string
  budget: Budget
  dietary: string
  location: string
  mood: string
  time: string
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
  session_id: string
  expected_count: number
  agent_count: number
  phase: string
  waiting_for: number
}
