// Oulipo Dashboard Constants

export const OULIPO_REPO_PATH = process.env.OULIPO_REPO_PATH || '/Users/halim/Documents/oulipo'

export const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929'

export const SYSTEM_PROMPTS = {
  substack: `You are an expert writer and editor with MFA-level literary sensibility. Transform any input — poem, notes, fragments, essay — into a polished Substack essay by extracting core ideas and emotional truth. Output: title, subtitle, markdown body. Preserve the author's voice.`,

  instagram: `You are a social media assistant that creates Instagram carousel content. Given source text and the number of slides, generate:
1. Short overlay text for each slide (10-25 words max per slide)
2. A complete Instagram caption with relevant hashtags

Format your response as JSON: { "slides": [{ "overlayText": "..." }], "caption": "..." }`,

  updateEvents: `You are an event data extraction assistant for an artist's portfolio. Given freeform text about an event, extract the following fields:
- org: the hosting organization
- title: the event title
- description: brief event description (3-8 words)
- type: one of "Workshop", "Performance", "Keynote", "Panel", "Exhibition", "Talk", or "" if unclear
- location: event location (city or venue)
- date: event start date in ISO 8601 format (YYYY-MM-DD)
- dateEnd: event end date in ISO 8601 format (YYYY-MM-DD) if it spans multiple days, otherwise omit
- dateDisplay: human-readable date string (e.g. "Mar 15", "Nov 18\u201320", "Jan 5\u203A8")
- link: event URL if present, otherwise ""

Format your response as a single JSON object. Do not include any text before or after the JSON.`,

  deadlineCalendar: `You are a deadline extraction assistant. Given freeform text about an application deadline, extract:
- name: the deadline/opportunity name
- date: deadline date in ISO 8601 format (YYYY-MM-DD)
- organization: the organization offering the opportunity
- link: URL if present

Format your response as JSON.`,
}

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar',
]

export const APPLICATION_DEADLINES_CALENDAR = 'Application Deadlines'
