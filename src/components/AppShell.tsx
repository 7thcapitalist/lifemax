"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/today", label: "Today" },
  { href: "/character", label: "Character" },
  { href: "/chronicle", label: "Chronicle" },
] as const;

export function BrandBar({
  subtitle,
  action,
}: {
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="brand-bar">
      <div>
        <Link href="/" className="brand">
          Life<span>maxing</span>
        </Link>
        {subtitle ? <p className="meta">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function AppShell({
  children,
  showNav = false,
  subtitle,
  action,
}: {
  children: ReactNode;
  showNav?: boolean;
  subtitle?: string;
  action?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className={showNav ? "app-shell app-shell--nav" : "app-shell"}>
      <BrandBar subtitle={subtitle} action={action} />
      {showNav ? (
        <nav className="nav-rail" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="content">{children}</div>
    </div>
  );
}
