import type { ArtifactLink } from "../types/artifacts";
import { kindFromUrl } from "../types/artifacts";

/**
 * Parser for the debrief body written by the daily-desk routine
 * (hmart.daily_debriefs.body). Deliberately not a markdown library: the
 * routine writes a tiny, stable subset and the panel renders exactly that.
 *
 * Supported:
 *   ## section          -> head
 *   - bullet / * bullet -> list item
 *   blank line          -> gap
 *   anything else       -> paragraph line
 *
 * Inside any line, `[Title](https://...)` is lifted out of the prose and
 * returned as an ArtifactLink so the panel can render it with the same
 * attachment chip a todo uses. Bare URLs are left in the text and linkified
 * by the panel. Non-https markdown links are left as literal text rather than
 * silently dropped.
 */

export interface DebriefItem {
  text: string;
  artifacts: ArtifactLink[];
}

export type DebriefBlock =
  | { t: "head"; text: string }
  | { t: "list"; items: DebriefItem[] }
  | { t: "line"; text: string; artifacts: ArtifactLink[] }
  | { t: "gap" };

const MD_LINK = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;

/** Left behind when a chip is lifted off the end of a line ("yi call -"). */
const DANGLING_TAIL = /[\s]*[-–—:,|·]+\s*$/;

/**
 * Pull `[Title](https://...)` links out of a line. Returns the remaining
 * prose and the links, in the order they appeared.
 */
export function extractArtifacts(line: string): DebriefItem {
  const artifacts: ArtifactLink[] = [];
  const text = line.replace(MD_LINK, (_m, title: string, url: string) => {
    artifacts.push({
      url,
      title: title.trim() || url.replace(/^https:\/\//i, ""),
      kind: kindFromUrl(url),
    });
    return "";
  });
  const cleaned = artifacts.length
    ? text
        .replace(/\s{2,}/g, " ")
        .replace(DANGLING_TAIL, "")
        .trim()
    : text;
  return { text: cleaned, artifacts };
}

export function parseDebrief(body: string): DebriefBlock[] {
  const out: DebriefBlock[] = [];
  let list: DebriefItem[] | null = null;

  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const isBullet = /^\s*[-*]\s+/.test(line);

    if (list && !isBullet) {
      out.push({ t: "list", items: list });
      list = null;
    }

    if (/^##\s+/.test(line)) {
      out.push({ t: "head", text: line.replace(/^##\s+/, "") });
    } else if (isBullet) {
      if (!list) list = [];
      list.push(extractArtifacts(line.replace(/^\s*[-*]\s+/, "")));
    } else if (line.trim() === "") {
      out.push({ t: "gap" });
    } else {
      const { text, artifacts } = extractArtifacts(line);
      out.push({ t: "line", text, artifacts });
    }
  }

  if (list) out.push({ t: "list", items: list });
  return out;
}
