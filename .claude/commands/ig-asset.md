---
name: ig-asset
description: "Generate Instagram-ready assets (announcement or carousel) using oulipo brand templates. Triggers on: ig asset, instagram, ig post, ig carousel, announcement asset."
---

# Instagram Asset Generator

Generate 1080x1350 Instagram-ready PNGs using the oulipo brand templates. Two modes: **announcement** (single post) and **carousel** (multi-slide).

## How It Works

You collect the details from the user, build a JSON payload, then run `node scripts/ig-render.mjs` to generate the PNGs. The script uses Puppeteer to render HTML templates at exact Instagram dimensions.

## Step 1: Detect Mode

From the user's message, determine which mode:

- **announcement** — they mention an event, exhibition, residency, talk, workshop, performance, or similar
- **carousel** — they mention an essay, article, text, thinking, or want multiple slides

If unclear, ask: "Is this an announcement (single post) or a carousel (multi-slide for text content)?"

## Step 2: Collect Details

### Announcement Mode

Collect these fields (ask for any missing required ones):

| Field         | Required | Example                                                                   |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `title`       | yes      | "Media Archaeology Lab"                                                   |
| `eventType`   | yes      | "Residency", "Exhibition", "Talk", "Performance", "Workshop", "Screening" |
| `venue`       | yes      | "University of Colorado Boulder"                                          |
| `dates`       | yes      | "March 15 — April 20, 2026"                                               |
| `description` | no       | 1-3 sentences about the event                                             |
| image path    | no       | absolute path to a hero image file (.jpg, .png, .webp)                    |
| `credit`      | no       | photo credit line                                                         |

### Carousel Mode

Collect these fields:

| Field        | Required | Example                                                   |
| ------------ | -------- | --------------------------------------------------------- |
| `title`      | yes      | "Border Poetics"                                          |
| `subtitle`   | no       | "from an essay on language and territory"                 |
| `body`       | yes      | The full text content (can be pasted or read from a file) |
| `authorName` | no       | defaults to "Halim Flowers"                               |
| `cta`        | no       | closing slide text, e.g. "link in bio"                    |

If the user provides a file path for the body text, read the file contents first.

## Step 3: Choose Theme

Ask which theme (1-3) or default to 1 (matrix). The themes are:

1. **matrix** — black bg, green ASCII pattern (default)
2. **terminal** — dark bg, green scanlines
3. **mono** — pure black, white text

Tip: the user can preview all themes by opening `templates/ig-backgrounds.html` in a browser.

## Step 4: Generate

Build the output directory name as: `ig-exports/{mode}-{slugified-title}-{YYYY-MM-DD}`

### Announcement command:

```bash
node scripts/ig-render.mjs \
  --mode announcement \
  --theme {1-3} \
  --data '{JSON_PAYLOAD}' \
  --image {IMAGE_PATH_OR_OMIT} \
  --output ig-exports/{OUTPUT_DIR_NAME}
```

The JSON payload for announcement:

```json
{
  "title": "...",
  "eventType": "...",
  "venue": "...",
  "dates": "...",
  "description": "...",
  "credit": "..."
}
```

### Carousel command:

```bash
node scripts/ig-render.mjs \
  --mode carousel \
  --theme {1-3} \
  --data '{JSON_PAYLOAD}' \
  --output ig-exports/{OUTPUT_DIR_NAME}
```

The JSON payload for carousel:

```json
{
  "title": "...",
  "subtitle": "...",
  "body": "...",
  "authorName": "...",
  "cta": "..."
}
```

**Important**: For the `--data` flag, escape single quotes in the JSON. If the text contains single quotes, write the JSON to a temp file and use `--data "$(cat /tmp/ig-data.json)"` instead.

## Step 5: Report Results

After the script runs, tell the user:

- How many files were generated
- The output directory path
- Suggest they open the files to verify before posting

Open the output directory:

```bash
open {OUTPUT_DIR_PATH}
```

## Notes

- All output goes to `ig-exports/` which is gitignored
- Images are 1080x1350px (4:5 aspect ratio) — optimal for Instagram profile grid
- The script loads fonts from type.cargo.site — requires internet connection
- If no image is provided for announcements, renders a clean text-only layout
- Carousel slides are split at paragraph boundaries, ~200 words per slide
- Instagram allows up to 20 slides per carousel
