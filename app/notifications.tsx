"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getNotifications,
  dismissNotification,
  updateNotification,
  markSent,
  Notification,
} from "../lib/notifications";
import { getIntegrationSettings } from "../lib/integration-settings";
import { markContacted } from "../lib/contacts-store";

const TYPE_COLORS: Record<string, string> = {
  pending_dm: "var(--accent)",
  pending_referral_dm: "#60a5fa",
  pending_outreach: "var(--accent)",
  pending_ceo_email: "#a78bfa",
  followup_reminder: "#60a5fa",
  interview_reminder: "var(--success)",
  offer_deadline: "var(--error)",
  info: "var(--text-secondary)",
};

const TYPE_LABELS: Record<string, string> = {
  pending_dm: "DM",
  pending_referral_dm: "REFERRAL DM",
  pending_outreach: "HM OUTREACH",
  pending_ceo_email: "CEO EMAIL",
  followup_reminder: "FOLLOW UP",
  interview_reminder: "INTERVIEW",
  offer_deadline: "DEADLINE",
  info: "INFO",
};

const EMAIL_TYPES = new Set(["pending_outreach", "pending_ceo_email"]);
const LINKEDIN_TYPES = new Set(["pending_dm", "pending_referral_dm"]);

function isDue(n: Notification): boolean {
  if (n.sent || n.dismissed) return false;
  if (!n.dueAt) return true;
  return n.dueAt <= new Date().toISOString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ id: string; text: string; kind: "ok" | "err" } | null>(null);

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

  const dismiss = (id: string) => { dismissNotification(id); refresh(); };

  const startEdit = (n: Notification) => {
    setEditingId(n.id);
    setEditText(n.generatedContent ?? "");
  };

  const saveEdit = (id: string) => {
    updateNotification(id, { generatedContent: editText });
    setEditingId(null);
    refresh();
  };

  const copyAndOpenLinkedIn = async (n: Notification) => {
    if (!n.generatedContent) return;
    try {
      await navigator.clipboard.writeText(n.generatedContent);
      setStatusMsg({ id: n.id, text: "Copied. Opening LinkedIn...", kind: "ok" });
      if (n.contactLinkedIn) {
        window.open(n.contactLinkedIn, "_blank", "noopener,noreferrer");
      } else {
        window.open("https://www.linkedin.com/feed/", "_blank");
      }
      markSent(n.id);
      if (n.contactId) markContacted(n.contactId);
      setTimeout(() => { setStatusMsg(null); refresh(); }, 1500);
    } catch (e: any) {
      setStatusMsg({ id: n.id, text: `Copy failed: ${e.message}`, kind: "err" });
    }
  };

  const sendEmailNow = async (n: Notification) => {
    if (!n.generatedContent) return;
    const integ = getIntegrationSettings();
    if (!integ.resendApiKey || !integ.senderEmail) {
      setStatusMsg({ id: n.id, text: "Configure Resend + sender email in Settings.", kind: "err" });
      return;
    }
    if (!n.contactEmail) {
      setStatusMsg({ id: n.id, text: "No recipient email on this contact.", kind: "err" });
      return;
    }
    setSendingId(n.id);
    try {
      const res = await fetch("/api/send/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: n.contactEmail,
          subject: "Hi",
          body: n.generatedContent,
          resendApiKey: integ.resendApiKey,
          senderEmail: integ.senderEmail,
          senderName: integ.senderName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      markSent(n.id);
      if (n.contactId) markContacted(n.contactId);
      setStatusMsg({ id: n.id, text: "Sent.", kind: "ok" });
      setTimeout(() => { setStatusMsg(null); refresh(); }, 1500);
    } catch (e: any) {
      setStatusMsg({ id: n.id, text: e.message, kind: "err" });
    } finally {
      setSendingId(null);
    }
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
          <span style={{ background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.5rem", fontWeight: 700 }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
        INBOX
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, width: 420,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", zIndex: 50,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            maxHeight: "85vh", overflowY: "auto",
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
              notifs.map(n => {
                const isLinkedIn = LINKEDIN_TYPES.has(n.type);
                const isEmail = EMAIL_TYPES.has(n.type);
                const editing = editingId === n.id;
                const status = statusMsg?.id === n.id ? statusMsg : null;
                return (
                  <div key={n.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: TYPE_COLORS[n.type] ?? "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {TYPE_LABELS[n.type] ?? n.type}
                      </span>
                      <button onClick={() => dismiss(n.id)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "0.625rem", padding: 0 }}>DISMISS</button>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-primary)", marginBottom: 4 }}>{n.title}</div>
                    {n.contactEmail && <div style={{ fontSize: "0.625rem", color: "var(--text-tertiary)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>→ {n.contactEmail}</div>}
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: n.generatedContent ? 8 : 0 }}>{n.body}</div>

                    {n.generatedContent && !editing && (
                      <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border-light)", padding: "8px 10px", borderRadius: "var(--radius)", fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 180, overflowY: "auto", marginBottom: 8 }}>
                        {n.generatedContent}
                      </div>
                    )}
                    {editing && (
                      <div style={{ marginBottom: 8 }}>
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows={10}
                          style={{ width: "100%", padding: 8, background: "var(--bg-primary)", border: "1px solid var(--accent)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.7rem", resize: "vertical", borderRadius: "var(--radius)" }}
                        />
                      </div>
                    )}

                    {status && (
                      <div style={{ fontSize: "0.625rem", color: status.kind === "ok" ? "var(--success)" : "var(--error)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>{status.text}</div>
                    )}

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {n.applicationSlug && !editing && (
                        <Link href={`/application/?slug=${n.applicationSlug}`} onClick={() => setOpen(false)} style={inboxLink}>VIEW APP</Link>
                      )}
                      {n.generatedContent && !editing && (
                        <button onClick={() => startEdit(n)} style={inboxBtn}>EDIT</button>
                      )}
                      {editing && (
                        <>
                          <button onClick={() => saveEdit(n.id)} style={{ ...inboxBtn, color: "var(--success)", borderColor: "var(--success)" }}>SAVE</button>
                          <button onClick={() => setEditingId(null)} style={inboxBtn}>CANCEL</button>
                        </>
                      )}
                      {!editing && isLinkedIn && n.generatedContent && (
                        <button onClick={() => copyAndOpenLinkedIn(n)} style={{ ...inboxBtn, color: "var(--accent)", borderColor: "var(--accent)" }}>
                          COPY + OPEN LINKEDIN
                        </button>
                      )}
                      {!editing && isEmail && n.generatedContent && (
                        <button onClick={() => sendEmailNow(n)} disabled={sendingId === n.id} style={{ ...inboxBtn, color: "var(--success)", borderColor: "var(--success)" }}>
                          {sendingId === n.id ? "SENDING..." : "SEND NOW"}
                        </button>
                      )}
                      {!editing && isEmail && n.contactEmail && (
                        <a href={`mailto:${n.contactEmail}?subject=Hi&body=${encodeURIComponent(n.generatedContent ?? "")}`} style={inboxLink}>MAIL APP</a>
                      )}
                      {!editing && (
                        <button onClick={() => dismiss(n.id)} style={inboxBtn}>DONE</button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

const inboxBtn: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.5rem",
  color: "var(--text-tertiary)",
  background: "none",
  border: "1px solid var(--border)",
  padding: "3px 8px",
  borderRadius: "var(--radius)",
  cursor: "pointer",
  letterSpacing: "0.05em",
};

const inboxLink: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.5rem",
  color: "var(--accent)",
  textDecoration: "none",
  border: "1px solid var(--accent)",
  padding: "3px 8px",
  borderRadius: "var(--radius)",
  letterSpacing: "0.05em",
};
