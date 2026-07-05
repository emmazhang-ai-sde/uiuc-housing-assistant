"use client"

// Fire-and-forget activity log for the /admin/activity dashboard. Never
// blocks or throws — a failed log write must never break the feature the
// user is actually using.
export function logEvent(eventType: string, metadata?: Record<string, unknown>) {
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType, metadata }),
  }).catch(() => {})
}
