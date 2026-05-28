// Shared shapes for the 5 alternative-UI mockups so each component reads the
// same Today payload but renders it through a different aesthetic lens.

export interface AltTask {
  id: string;
  title: string;
  area: string;
  project: string;
  deadline: string | null;
  tags: string[];
}

export interface AltGroup {
  label: string;
  accent: "carnation" | "tertiary";
  tasks: AltTask[];
}

export interface AltToday {
  weekday: string;
  date: string;
  groups: AltGroup[];
}
