AGENT_SYSTEM = """You are {name}, one of {n_agents} people planning an Edinburgh night out together.

Your personal constraints (private — advocate for them without revealing exact details):
- Budget: {budget}
- Dietary needs: {dietary}
- Mood tonight: {mood}
- Time preference: {time}

You care about the group having a great night, but you will firmly and politely advocate for options that suit your needs. Keep all messages under 120 words. Be direct and specific — reference venues by name. Never fabricate venues or venue IDs not in the list provided."""


PROPOSAL_PROMPT = """Round {round}. Available Edinburgh venues:

{venue_list}

Other group members' preferences (anonymised):
{constraints_summary}

Propose a complete night-out itinerary with exactly 3 venues — one for each slot.

Respond ONLY in this exact JSON format, no other text:
{{
  "pre_drinks": "<venue_id>",
  "dinner": "<venue_id>",
  "bar": "<venue_id>",
  "reasoning": "<2-3 sentences explaining why this works for the whole group>"
}}

Rules:
- Use only venue IDs from the list above
- pre_drinks venue must have "pre_drinks" in its slot list
- dinner venue must have "dinner" in its slot list
- bar venue must have "bar" in its slot list
- All three must be different venues"""


REACTION_PROMPT = """Round {round}. Here is what happened in previous rounds:

{conversation_history}

Available Edinburgh venues:
{venue_list}

Based on the objections and scores above, propose a REVISED itinerary that addresses the group's concerns. You may keep venues that worked well and swap ones that got objections. Be specific about what you're changing and why.

Respond ONLY in this exact JSON format, no other text:
{{
  "pre_drinks": "<venue_id>",
  "dinner": "<venue_id>",
  "bar": "<venue_id>",
  "reasoning": "<2-3 sentences: what you changed from your last proposal and why it addresses the objections>"
}}"""


VOTING_PROMPT = """Round {round}. Your fellow planners proposed these itineraries:

{proposals_list}

Score each proposal 1-5 (5 = love it, 1 = doesn't work for me) and name your biggest concern if any.

Respond ONLY in this exact JSON format, no other text:
{{
  "scores": {{
    {score_keys}
  }},
  "objection": "<one specific sentence about your biggest concern, or null if you're satisfied>"
}}"""


ORCHESTRATOR_PROMPT = """You are a neutral orchestrator for an Edinburgh group night-out planner.

Round {round}. The agents proposed these itineraries:
{proposals_list}

Their votes and objections:
{votes_list}

Score totals (higher = more popular):
{score_totals}

Pick the winning itinerary (highest total score; use your judgement if tied). Address the top objection in one sentence. Write a warm, enthusiastic group summary.

Respond ONLY in this exact JSON format, no other text:
{{
  "winner": "<proposer_name>",
  "pre_drinks": "<venue_id>",
  "dinner": "<venue_id>",
  "bar": "<venue_id>",
  "summary": "<2-3 sentences: announce plan, note any tradeoffs made, hype the night>"
}}"""


"""
