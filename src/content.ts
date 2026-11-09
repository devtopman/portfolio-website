import { config } from "./config";

export type SiteContent = typeof config;

/**
 * Loads admin-edited content from /api/content and merges it over the
 * defaults in config.ts (in place, so every component sees it).
 * Falls back silently to the defaults if the API is unreachable.
 */
export async function loadContent(timeoutMs = 3000): Promise<void> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch("/api/content", {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return;
    const remote = await res.json();
    if (remote && typeof remote === "object") applyContent(remote);
  } catch {
    /* use defaults */
  }
}

/** Merge content into the live config (one level deep, so new default fields survive). */
export function applyContent(remote: Record<string, any>): void {
  const target = config as Record<string, any>;
  for (const key of Object.keys(remote)) {
    const v = remote[key];
    if (v && typeof v === "object" && !Array.isArray(v) && target[key] && typeof target[key] === "object") {
      Object.assign(target[key], v);
    } else {
      target[key] = v;
    }
  }
}
