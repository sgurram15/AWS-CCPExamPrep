"use client";

// Auth was removed when the app went fully client-side/static. This is now a
// passthrough so existing page wrappers keep working without edits.
export function RequireAuth({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
