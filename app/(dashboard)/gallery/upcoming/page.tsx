"use client";

import { useState, useEffect, useCallback } from "react";
import "./upcoming.css";

const EVENT_TYPES = [
  "",
  "Workshop",
  "Performance",
  "Keynote",
  "Panel",
  "Exhibition",
  "Talk",
] as const;

const FIELD_GUIDE = [
  { field: "Title", required: true, format: "Event name" },
  { field: "Date", required: true, format: "YYYY-MM-DD" },
  { field: "Org", required: false, format: "Hosting organization" },
  { field: "Description", required: false, format: "Brief, 3\u20138 words" },
  {
    field: "Type",
    required: false,
    format: "Workshop, Performance, Keynote, Panel, Exhibition, Talk",
  },
  { field: "Location", required: false, format: "City or venue" },
  {
    field: "Date End",
    required: false,
    format: "YYYY-MM-DD (multi-day events)",
  },
  { field: "Link", required: false, format: "Full URL" },
] as const;

interface SupabaseStatus {
  configured: boolean;
  connected?: boolean;
  table?: string;
  error?: string;
  hint?: string;
  message?: string;
  diagnostics?: {
    hostname?: string;
    keyType?: string;
    keyPrefix?: string;
    warning?: string;
    isPat?: boolean;
  };
}

interface EventForm {
  title: string;
  date: string;
  org: string;
  description: string;
  type: string;
  location: string;
  dateEnd: string;
  link: string;
  postingIdea: string;
}

const EMPTY_FORM: EventForm = {
  title: "",
  date: "",
  org: "",
  description: "",
  type: "",
  location: "",
  dateEnd: "",
  link: "",
  postingIdea: "",
};

function formatDateDisplay(date: string, dateEnd?: string): string {
  try {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return date;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const formatted = `${months[dt.getMonth()]} ${dt.getDate()}`;
    if (dateEnd) {
      const [ey, em, ed] = dateEnd.split("-").map(Number);
      const endDt = new Date(ey, em - 1, ed);
      if (!isNaN(endDt.getTime()) && dt.getMonth() === endDt.getMonth()) {
        return `${formatted}\u2013${endDt.getDate()}`;
      }
      if (!isNaN(endDt.getTime())) {
        return `${formatted} \u2013 ${months[endDt.getMonth()]} ${endDt.getDate()}`;
      }
    }
    return formatted;
  } catch {
    return date;
  }
}

export default function UpcomingPage() {
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatus | null>(
    null,
  );
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    fetch("/api/supabase/status")
      .then((r) => r.json())
      .then((s: SupabaseStatus) => setSupabaseStatus(s))
      .catch(() =>
        setSupabaseStatus({
          configured: false,
          message: "Could not check Supabase status.",
        }),
      );
  }, []);

  const updateField = useCallback(
    (field: keyof EventForm) =>
      (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
      },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.title.trim() || !form.date.trim()) return;

      setSaving(true);
      setError("");
      setSuccess(null);

      const event: Record<string, unknown> = {};
      if (form.title.trim()) event.title = form.title.trim();
      if (form.date.trim()) event.date = form.date.trim();
      if (form.org.trim()) event.org = form.org.trim();
      if (form.description.trim()) event.description = form.description.trim();
      if (form.type) event.type = form.type;
      if (form.location.trim()) event.location = form.location.trim();
      if (form.dateEnd.trim()) event.dateEnd = form.dateEnd.trim();
      if (form.link.trim()) event.link = form.link.trim();

      event.dateDisplay = formatDateDisplay(
        form.date.trim(),
        form.dateEnd.trim() || undefined,
      );

      const postingIdea = form.postingIdea.trim() || undefined;

      try {
        const res = await fetch("/api/upcoming/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, postingIdea }),
        });
        const data = await res.json();

        if (!res.ok) {
          let errMsg = data.error || "Save failed";
          if (data.detail?.hint) errMsg += "\n" + data.detail.hint;
          throw new Error(errMsg);
        }

        setSuccess(
          `Saved: ${event.title}${data.table ? ` \u2192 ${data.table}` : ""}`,
        );

        try {
          const POSTABLE_KEY = "content-publisher-postable-tasks";
          const existing = JSON.parse(
            localStorage.getItem(POSTABLE_KEY) || "[]",
          );
          const newTask = {
            id: `event-${Date.now()}`,
            title: String(event.title),
            notes: "",
            postingIdea: postingIdea || `Post about: ${event.title}`,
            status: "active",
          };
          localStorage.setItem(
            POSTABLE_KEY,
            JSON.stringify([newTask, ...existing]),
          );
        } catch {
          /* non-fatal */
        }

        setForm(EMPTY_FORM);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save event");
      } finally {
        setSaving(false);
      }
    },
    [form],
  );

  const statusDiag = supabaseStatus?.diagnostics;
  const datePreview =
    form.date.trim() &&
    formatDateDisplay(form.date.trim(), form.dateEnd.trim() || undefined);

  return (
    <div className="upcoming-page">
      <h1 className="page-title">Upcoming</h1>
      <p className="upcoming-intro">
        Add events directly. Required fields are marked with *.
      </p>

      {/* Field reference guide */}
      <details
        className="upcoming-guide"
        open={guideOpen}
        onToggle={(e) => setGuideOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="upcoming-guide__toggle">
          Field reference{guideOpen ? "" : " \u2014 click to expand"}
        </summary>
        <table className="upcoming-guide__table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Required</th>
              <th>Format</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_GUIDE.map((f) => (
              <tr key={f.field}>
                <td>{f.field}</td>
                <td>{f.required ? "Yes" : "\u2014"}</td>
                <td>{f.format}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {/* Status banners */}
      {supabaseStatus && !supabaseStatus.configured && (
        <div className="upcoming-warning" role="alert">
          <strong>Supabase not configured.</strong> Add{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> to Vercel (Project Settings
          &gt; Environment Variables).
        </div>
      )}
      {statusDiag?.isPat && (
        <div className="upcoming-error" role="alert">
          <strong>Wrong key type.</strong>{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> is a Personal Access Token.
          Replace it with the secret key from Dashboard &gt; Project Settings
          &gt; API.
        </div>
      )}
      {supabaseStatus?.configured &&
        !statusDiag?.isPat &&
        !supabaseStatus?.connected &&
        supabaseStatus?.error && (
          <div className="upcoming-warning" role="alert">
            <strong>Connection issue:</strong> {supabaseStatus.error}
            {supabaseStatus.hint && (
              <p className="upcoming-warning-hint">{supabaseStatus.hint}</p>
            )}
          </div>
        )}

      {error && (
        <div
          className="upcoming-error"
          role="alert"
          style={{ whiteSpace: "pre-line" }}
        >
          {error}
        </div>
      )}
      {success && (
        <div className="upcoming-success" role="status">
          {success}
        </div>
      )}

      {/* Event form */}
      <form className="upcoming-form" onSubmit={handleSubmit} noValidate>
        {/* Title — full width */}
        <div className="upcoming-field upcoming-field--full">
          <label htmlFor="ev-title" className="upcoming-label">
            Title *
          </label>
          <input
            id="ev-title"
            type="text"
            className="upcoming-input"
            value={form.title}
            onChange={updateField("title")}
            placeholder="Event name"
            required
            disabled={saving}
          />
        </div>

        {/* Org + Type */}
        <div className="upcoming-field">
          <label htmlFor="ev-org" className="upcoming-label">
            Org
          </label>
          <input
            id="ev-org"
            type="text"
            className="upcoming-input"
            value={form.org}
            onChange={updateField("org")}
            placeholder="Hosting organization"
            disabled={saving}
          />
        </div>
        <div className="upcoming-field">
          <label htmlFor="ev-type" className="upcoming-label">
            Type
          </label>
          <select
            id="ev-type"
            className="upcoming-select"
            value={form.type}
            onChange={updateField("type")}
            disabled={saving}
          >
            <option value="">Select type</option>
            {EVENT_TYPES.filter(Boolean).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Date + Date End */}
        <div className="upcoming-field">
          <label htmlFor="ev-date" className="upcoming-label">
            Date *
          </label>
          <input
            id="ev-date"
            type="date"
            className="upcoming-input"
            value={form.date}
            onChange={updateField("date")}
            required
            disabled={saving}
          />
        </div>
        <div className="upcoming-field">
          <label htmlFor="ev-dateEnd" className="upcoming-label">
            Date End
          </label>
          <input
            id="ev-dateEnd"
            type="date"
            className="upcoming-input"
            value={form.dateEnd}
            onChange={updateField("dateEnd")}
            disabled={saving}
          />
        </div>

        {/* Date display preview */}
        {datePreview && (
          <div className="upcoming-field upcoming-field--full">
            <span className="upcoming-date-preview">
              Display: <strong>{datePreview}</strong>
            </span>
          </div>
        )}

        {/* Location + Link */}
        <div className="upcoming-field">
          <label htmlFor="ev-location" className="upcoming-label">
            Location
          </label>
          <input
            id="ev-location"
            type="text"
            className="upcoming-input"
            value={form.location}
            onChange={updateField("location")}
            placeholder="City or venue"
            disabled={saving}
          />
        </div>
        <div className="upcoming-field">
          <label htmlFor="ev-link" className="upcoming-label">
            Link
          </label>
          <input
            id="ev-link"
            type="url"
            className="upcoming-input"
            value={form.link}
            onChange={updateField("link")}
            placeholder="https://..."
            disabled={saving}
          />
        </div>

        {/* Description — full width */}
        <div className="upcoming-field upcoming-field--full">
          <label htmlFor="ev-description" className="upcoming-label">
            Description
          </label>
          <input
            id="ev-description"
            type="text"
            className="upcoming-input"
            value={form.description}
            onChange={updateField("description")}
            placeholder="Brief, 3\u20138 words"
            disabled={saving}
          />
        </div>

        {/* Posting idea — full width */}
        <div className="upcoming-field upcoming-field--full">
          <label htmlFor="ev-postingIdea" className="upcoming-label">
            Posting idea
          </label>
          <textarea
            id="ev-postingIdea"
            className="upcoming-textarea"
            value={form.postingIdea}
            onChange={updateField("postingIdea")}
            placeholder="One-line idea for what to post about this event"
            rows={2}
            disabled={saving}
          />
        </div>

        {/* Submit */}
        <div className="upcoming-field upcoming-field--full upcoming-actions">
          <button
            type="submit"
            className="upcoming-submit"
            disabled={saving || !form.title.trim() || !form.date.trim()}
          >
            {saving ? "Saving\u2026" : "Save Event"}
          </button>
        </div>
      </form>
    </div>
  );
}
