"use client";

import { useEffect, useState } from "react";
import { onToast, ToastKind } from "../lib/toast";

type Item = { id: number; text: string; kind: ToastKind };

let nextId = 1;

// Mounted once in the root layout. Any write-through helper can call
// showToast() from lib/toast.ts and it will surface here, on every page.
export default function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    return onToast(({ text, kind }) => {
      const id = nextId++;
      setItems(prev => [...prev, { id, text, kind }]);
      setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 5000);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed", bottom: 16, right: 16, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8, maxWidth: 360,
      }}
    >
      {items.map(item => (
        <div
          key={item.id}
          style={{
            background: "var(--surface)",
            border: `1px solid ${item.kind === "error" ? "var(--error)" : "var(--success)"}`,
            color: item.kind === "error" ? "var(--error)" : "var(--success)",
            borderRadius: "var(--radius)",
            padding: "10px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}
