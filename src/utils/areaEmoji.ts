/**
 * An area's name starts with the emoji the user chose for it ("🩺 health").
 * That emoji is the area's mark wherever the name does not fit: a project
 * row, a project's title.
 */
const LEADING_EMOJI = /^\s*(\p{Extended_Pictographic}️?)\s*/u;

export function areaEmoji(name: string | null | undefined): string {
  return name?.match(LEADING_EMOJI)?.[1] ?? "";
}
