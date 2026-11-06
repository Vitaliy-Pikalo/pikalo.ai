"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const CALCULATORS = [
  { href: "/check", label: "Residency" },
  { href: "/fica", label: "FICA refund" },
  { href: "/roth", label: "Roth IRA" },
];

function NavLink({
  href,
  label,
  strong,
}: {
  href: string;
  label: string;
  strong?: boolean;
}) {
  const current = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`underline-offset-[6px] hover:text-ink ${
        current ? "font-semibold text-ink underline decoration-stamp decoration-2" : ""
      } ${strong ? "font-semibold text-ink" : ""}`}
    >
      {label}
    </Link>
  );
}

/** Main nav: the assistant, the three calculators as one group, the guide. */
export default function SiteNav() {
  return (
    <nav
      aria-label="Main"
      className="-mx-4 flex items-center gap-x-5 overflow-x-auto px-4 pb-1 text-sm whitespace-nowrap text-slate sm:mx-0 sm:flex-wrap sm:justify-end sm:gap-y-2 sm:overflow-visible sm:px-0 sm:pb-0 sm:whitespace-normal"
    >
      <NavLink href="/ask" label="Ask" strong />
      <div className="flex items-center gap-x-4 sm:flex-wrap sm:gap-y-1">
        <span className="hidden text-xs font-semibold tracking-wide text-slate/80 uppercase sm:inline">
          Calculators
        </span>
        {CALCULATORS.map((c) => (
          <NavLink key={c.href} href={c.href} label={c.label} />
        ))}
      </div>
      <NavLink href="/traps" label="Money traps" />
      <NavLink href="/account" label="My Pikalo" />
    </nav>
  );
}
