"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/today", label: "Today", icon: "sun" },
  { href: "/quests", label: "Quests", icon: "quest" },
  { href: "/character", label: "Character", icon: "character" },
  { href: "/chapter", label: "Chapter", icon: "chapter" },
  { href: "/rewards", label: "Rewards", icon: "reward" },
] as const;

function NavIcon({ name }: { name: (typeof NAV)[number]["icon"] }) {
  const paths = {
    sun: "M12 3v2m0 14v2M3 12h2m14 0h2m-3.64-6.36-1.42 1.42M8.06 15.94l-1.42 1.42m0-11.72 1.42 1.42m7.88 8.88 1.42 1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    quest: "m5 12 4 4L19 6",
    character: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0",
    chapter: "M5 4h11a3 3 0 0 1 3 3v13H7a2 2 0 0 1-2-2V4Zm2 12h12",
    reward:
      "M12 21V8m0 0H7.5A2.5 2.5 0 1 1 10 5.5L12 8Zm0 0h4.5A2.5 2.5 0 1 0 14 5.5L12 8ZM5 11h14v10H5z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

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
        <nav className="bottom-nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="content">{children}</div>
    </div>
  );
}
