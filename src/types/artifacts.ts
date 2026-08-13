import type { TodoRow } from "./database";

/**
 * Artifact links on a todo: the Google Doc / Sheet (or any URL) that IS the
 * task's deliverable. Stored as metadata.artifacts so any producer (the
 * daily-desk routine, a future integration, Halim by hand via SQL) can attach
 * one; the app renders them as attachment-style chips at the top of notes.
 *
 * kind is optional - when absent it is inferred from the URL so routine
 * writes can stay minimal ({url, title}).
 */
export type ArtifactKind = "doc" | "sheet" | "slides" | "folder" | "link";

export interface ArtifactLink {
  url: string;
  title: string;
  kind?: ArtifactKind;
}

export function kindFromUrl(url: string): ArtifactKind {
  if (url.includes("docs.google.com/document")) return "doc";
  if (url.includes("docs.google.com/spreadsheets")) return "sheet";
  if (url.includes("docs.google.com/presentation")) return "slides";
  if (url.includes("drive.google.com/drive/folders")) return "folder";
  return "link";
}

export function artifactsOf(t: TodoRow): ArtifactLink[] {
  const meta = (t.metadata ?? {}) as { artifacts?: unknown };
  if (!Array.isArray(meta.artifacts)) return [];
  return meta.artifacts.flatMap((a) => {
    if (
      typeof a !== "object" ||
      a === null ||
      typeof (a as ArtifactLink).url !== "string"
    )
      return [];
    const art = a as ArtifactLink;
    if (!/^https:\/\//i.test(art.url)) return [];
    return [
      {
        url: art.url,
        title: art.title || art.url.replace(/^https:\/\//i, ""),
        kind: art.kind ?? kindFromUrl(art.url),
      },
    ];
  });
}
