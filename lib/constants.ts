// Oulipo Dashboard Constants

export const OULIPO_REPO_PATH = process.env.OULIPO_REPO_PATH || '/Users/halim/Documents/oulipo'

export const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929'

export const SYSTEM_PROMPTS = {
  substack: `You are a writing assistant that transforms source text into polished Substack newsletter drafts. Output format: title, subtitle, and markdown body. Maintain the author's voice while making the content engaging for a newsletter audience.`,

  instagram: `You are a social media assistant that creates Instagram carousel content. Given source text and the number of slides, generate:
1. Short overlay text for each slide (10-25 words max per slide)
2. A complete Instagram caption with relevant hashtags

Format your response as JSON: { "slides": [{ "overlayText": "..." }], "caption": "..." }`,

  updateEvents: `You are an event data extraction assistant. Given freeform text about an event, extract the following fields:
- organization: the hosting organization
- title: the event title
- description: brief event description
- type: one of "workshop", "work", or "keynote"
- location: event location
- date: event date in ISO 8601 format (YYYY-MM-DD)
- link: event URL if present

Format your response as JSON.`,

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
