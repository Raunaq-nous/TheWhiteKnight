"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { setCache, runMigration, fetchAuthedJson } from "../lib/data-cache";

// Pages that must render without a session (middleware already allows these through).
const PUBLIC_PAGES = ["/login", "/register", "/onboard", "/admin/setup"];

// Blocks rendering until the server data is loaded into the in-memory cache.
// All lib/store.ts, lib/profile.ts, etc. functions read from the cache and
// write-through to server. careeros-theme stays in localStorage (per-device).
export default function DataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchAuthedJson("/api/data/bootstrap");
      if (cancelled) return;

      if (!result.ok) {
        if (result.unauthenticated) {
          // Not logged in. Public pages (login/register/onboard) render as-is;
          // anything else sends the user to the login form instead of crashing
          // on an HTML body.
          if (!PUBLIC_PAGES.some(p => pathname?.startsWith(p))) {
            router.replace("/login");
          }
          setReady(true);
          return;
        }
        setError(result.error ?? `Bootstrap failed: ${result.status ?? "unknown"}`);
        return;
      }

      setCache(result.data);
      await runMigration();
      if (cancelled) return;
      setReady(true);
    }

    load();
    return () => { cancelled = true; };
  }, [pathname, router]);

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
