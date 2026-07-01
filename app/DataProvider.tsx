"use client";

import { useEffect, useState } from "react";
import { setCache, runMigration } from "../lib/data-cache";

// Blocks rendering until the server data is loaded into the in-memory cache.
// All lib/store.ts, lib/profile.ts, etc. functions read from the cache and
// write-through to server. careeros-theme stays in localStorage (per-device).
export default function DataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/data/bootstrap", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            // Not logged in — still render (login/onboard pages must work).
            setReady(true);
            return;
          }
          throw new Error(`Bootstrap failed: ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setCache(data);
        await runMigration();
        if (cancelled) return;
        setReady(true);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Failed to load data");
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-mono)", color: "var(--error)", padding: 24, textAlign: "center",
      }}>
        <div>
          <div style={{ fontSize: "0.875rem", marginBottom: 8 }}>Data load failed</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontSize: "0.75rem",
      }}>
        loading
      </div>
    );
  }

  return <>{children}</>;
}
