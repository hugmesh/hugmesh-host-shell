/** A single home-surface announcement, as returned by the admin-bff endpoint
 *  GET /bff/announcements/home. The BFF only emits ACTIVE announcements targeted
 *  at the logged-in HOME surface (state=published, now within [starts_at,ends_at]
 *  and target_home=true), so the host shell renders what it is given, in the
 *  server-supplied priority order.
 *
 *  This is the SHARED announcement contract; the host only consumes the fields the
 *  HOME top banner needs (the public/login + akkoma + forum surfaces and the admin
 *  CRUD model carry the rest). `body_html` is sanitized server-side at create/update,
 *  but is STILL rendered inside a sandboxed null-origin srcdoc iframe here — never
 *  via raw innerHTML — as a second line of defence. */
export interface HomeAnnouncement {
  /** Stable uuid; also the localStorage dismiss key. */
  id: string;
  title: string;
  /** Server-sanitized admin HTML, rendered inside a sandboxed srcdoc iframe. */
  body_html: string;
  /** Higher first. The BFF lists in priority order; we re-sort defensively. */
  priority: number;
  /** When false, the banner hides the dismiss control and stays pinned. */
  dismissible: boolean;
  /** ISO-8601; null = active since forever. Used only for a defensive re-check. */
  starts_at: string | null;
  /** ISO-8601; null = open-ended. Used only for a defensive re-check. */
  ends_at: string | null;
}
