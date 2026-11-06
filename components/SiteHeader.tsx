"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TOOLS } from "@/lib/nav";

/**
 * Supabase keeps the session in a readable `sb-<project>-auth-token` cookie.
 * Checking for it lets the header stay static: the server never has to know.
 */
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;
const noSubscribe = () => () => {};

function useSignedIn() {
  return useSyncExternalStore(
    noSubscribe,
    () => SESSION_COOKIE.test(document.cookie),
    () => false,
  );
}

/** Open state that resets itself when the page changes. */
function useOpenOnPage(pathname: string) {
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const set = useCallback((v: boolean) => setOpenOn(v ? pathname : null), [pathname]);
  return [open, set] as const;
}

function Mark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" className="fill-ink" />
      <path
        d="M7 12.5l3.2 3.2L17 8.8"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-paper"
      />
    </svg>
  );
}

const link = (active: boolean) =>
  `rounded-md px-3 py-2 text-[15px] hover:bg-ink/5 hover:text-ink ${
    active ? "font-semibold text-ink" : "text-slate"
  }`;

function ToolsMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useOpenOnPage(pathname);
  const ref = useRef<HTMLDivElement>(null);
  const active = TOOLS.some((t) => t.href === pathname);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="tools-menu"
        onClick={() => setOpen(!open)}
        className={`${link(active)} flex items-center gap-1`}
      >
        Calculators
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      </button>
      <ul
        id="tools-menu"
        hidden={!open}
        className="absolute top-full left-0 z-50 mt-2 w-72 rounded-xl border border-line bg-surface p-2 shadow-[0_12px_32px_-12px_rgb(22_36_58/0.25)]"
      >
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={pathname === t.href ? "page" : undefined}
              className="block rounded-lg px-3 py-2.5 hover:bg-paper aria-[current=page]:bg-paper"
            >
              <span className="block font-semibold text-ink">{t.label}</span>
              <span className="block text-sm text-slate">{t.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const signedIn = useSignedIn();
  const [menu, setMenu] = useOpenOnPage(pathname);

  const account = signedIn
    ? { href: "/account", label: "My Pikalo" }
    : { href: "/login?next=%2Faccount", label: "Log in" };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70 print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight"
        >
          <Mark />
          pikalo
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          <Link
            href="/ask"
            aria-current={pathname === "/ask" ? "page" : undefined}
            className={link(pathname === "/ask")}
          >
            Ask
          </Link>
          <ToolsMenu pathname={pathname} />
          <Link
            href="/traps"
            aria-current={pathname === "/traps" ? "page" : undefined}
            className={link(pathname === "/traps")}
          >
            Money traps
          </Link>
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link
            href={account.href}
            aria-current={pathname === "/account" ? "page" : undefined}
            className={link(pathname === "/account" || pathname === "/login")}
          >
            {account.label}
          </Link>
          {!signedIn && (
            <Link
              href="/login?next=%2Faccount"
              className="rounded-lg bg-ink px-4 py-2 text-[15px] font-semibold text-surface hover:opacity-90"
            >
              Create free account
            </Link>
          )}
        </div>

        <Link
          href={account.href}
          className="ml-auto rounded-lg border border-field-line px-3 py-1.5 text-[15px] font-semibold text-ink md:hidden"
        >
          {account.label}
        </Link>
        <button
          type="button"
          aria-expanded={menu}
          aria-controls="mobile-menu"
          onClick={() => setMenu(!menu)}
          className="-mr-2 rounded-md p-2 text-ink hover:bg-ink/5 md:hidden"
        >
          <span className="sr-only">Menu</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6">
            {menu ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
            )}
          </svg>
        </button>
      </div>

      <nav
        id="mobile-menu"
        aria-label="Mobile"
        hidden={!menu}
        className="border-t border-line bg-paper px-4 pt-2 pb-5 md:hidden"
      >
        <ul className="space-y-1">
          {[
            { href: "/ask", label: "Ask a tax question" },
            ...TOOLS.map((t) => ({ href: t.href, label: `${t.label} calculator` })),
            { href: "/traps", label: "Money traps" },
          ].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className="block rounded-md px-3 py-2.5 text-ink aria-[current=page]:bg-surface aria-[current=page]:font-semibold"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2">
          {!signedIn && (
            <Link
              href="/login?next=%2Faccount"
              className="rounded-lg bg-ink px-4 py-3 text-center font-semibold text-surface"
            >
              Create free account
            </Link>
          )}
          <Link
            href={account.href}
            className="rounded-lg border border-field-line px-4 py-3 text-center font-semibold text-ink"
          >
            {account.label}
          </Link>
        </div>
      </nav>
    </header>
  );
}
