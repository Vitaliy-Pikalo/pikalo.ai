"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AskBox from "@/components/AskBox";

// Pages that already are the assistant, or where it would get in the way.
const HIDDEN_ON = ["/ask", "/login", "/review"];

/**
 * "Ask Pikalo" on every page: a launcher bottom-right that opens a panel.
 * The panel stays mounted while closed, so a typed question or an answer
 * survives closing it and moving between pages (the layout doesn't remount).
 */
export default function AssistantDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("textarea")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <div className="print:hidden">
      <div
        ref={panel}
        id="assistant-panel"
        role="dialog"
        aria-labelledby="assistant-title"
        hidden={!open}
        className="fixed inset-x-3 bottom-20 z-40 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border border-line bg-paper p-4 shadow-lg sm:inset-x-auto sm:right-6 sm:w-[26rem]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="assistant-title" className="font-bold">
              Ask Pikalo
            </h2>
            <p className="text-sm text-slate">Answers from IRS sources, with links.</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-slate hover:bg-surface hover:text-ink"
          >
            ✕
          </button>
        </div>
        <AskBox variant="panel" />
      </div>

      <button
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-controls="assistant-panel"
        onClick={() => (open ? close() : setOpen(true))}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 font-semibold text-surface shadow-lg hover:opacity-90 sm:right-6 sm:bottom-6"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-5 w-5"
          fill="currentColor"
        >
          <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V14h0a2.5 2.5 0 0 1-2-2.5z" />
        </svg>
        Ask Pikalo
      </button>
    </div>
  );
}
