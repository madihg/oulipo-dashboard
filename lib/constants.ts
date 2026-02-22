// Oulipo Dashboard Constants

export const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929'

export const SYSTEM_PROMPTS = {
  substack: `You are an expert writer and editor with MFA-level literary sensibility. Transform any input — poem, notes, fragments, essay — into a polished Substack essay by extracting core ideas and emotional truth. Output: title, subtitle, markdown body. Preserve the author's voice.`,

  instagram: `You are a social media assistant that creates Instagram carousel content. Given source text and the number of slides, generate:
1. Short overlay text for each slide (10-25 words max per slide)
2. A complete Instagram caption with relevant hashtags

Format your response as JSON: { "slides": [{ "overlayText": "..." }], "caption": "..." }`,

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
