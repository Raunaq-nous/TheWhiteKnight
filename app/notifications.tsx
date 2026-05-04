"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getNotifications,
  dismissNotification,
  getUnreadCount,
  Notification,
} from "../lib/notifications";

const TYPE_COLORS: Record<string, string> = {
  pending_dm: "var(--accent)",
  pending_outreach: "var(--accent)",
  followup_reminder: "#60a5fa",
  interview_reminder: "var(--success)",
  offer_deadline: "var(--error)",
  info: "var(--text-secondary)",
};

const TYPE_LABELS: Record<string, string> = {
  pending_dm: "ACTION REQUIRED",
  pending_outreach: "ACTION REQUIRED",
  followup_reminder: "FOLLOW UP",
  interview_reminder: "INTERVIEW",
  offer_deadline: "DEADLINE",
  info: "INFO",
};

function isDue(n: Notification): boolean {
  if (!n.dueAt) return true;
  return n.dueAt <= new Date().toISOString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    const all = getNotifications().filter(isDue);
    setNotifs(all);
    setCount(all.length);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("careeros-notif-change", refresh);
    const interval = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("careeros-notif-change", refresh);
      clearInterval(interval);
    };
  }, [refresh]);

  const dismiss = (id: string) => {
    dismissNotification(id);
    refresh();
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          color: count > 0 ? "var(--accent)" : "var(--text-tertiary)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.625rem",
          padding: "3px 8px",
          cursor: "pointer",
          borderRadius: "var(--radius)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {count > 0 && (
          <span style={{ background: "var(--accent)", color: "#000", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.5rem", fontWeight: 700 }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
        INBOX
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 360,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            zIndex: 50,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            maxHeight: "80vh",
            overflowY: "auto",
          }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                INBOX {count > 0 ? `(${count})` : ""}
              </span>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "0.75rem" }}>✕</button>
            </div>

            {notifs.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                No pending actions
              </div>
            ) : (
              notifs.map(n => (
                <div key={n.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: TYPE_COLORS[n.type] ?? "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                    <button onClick={() => dismiss(n.id)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "0.625rem", padding: 0 }}>
                      DISMISS
                    </button>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-primary)", marginBottom: 4 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: n.generatedContent || n.applicationSlug ? 8 : 0 }}>
                    {n.body}
                  </div>
                  {n.generatedContent && (
                    <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)", padding: "8px 10px", borderRadius: "var(--radius)", fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto", marginBottom: 8 }}>
                      {n.generatedContent.slice(0, 400)}{n.generatedContent.length > 400 ? "..." : ""}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    {n.applicationSlug && (
                      <Link
                        href={`/application/?slug=${n.applicationSlug}`}
                        onClick={() => setOpen(false)}
                        style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "var(--accent)", textDecoration: "none", border: "1px solid var(--accent)", padding: "3px 8px", borderRadius: "var(--radius)" }}
                      >
                        VIEW APP
                      </Link>
                    )}
                    <button
                      onClick={() => dismiss(n.id)}
                      style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "var(--text-tertiary)", background: "none", border: "1px solid var(--border)", padding: "3px 8px", borderRadius: "var(--radius)", cursor: "pointer" }}
                    >
                      DONE
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
