"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Analyze" },
  { href: "/scan", label: "Scan" },
  { href: "/memory", label: "Memory" },
  { href: "/profile", label: "Profile" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-zinc-50/80 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-sm text-white dark:bg-white dark:text-zinc-900" aria-hidden>
            ◆
          </span>
          <span className="hidden sm:inline">Opportunity Shield</span>
        </Link>
        <nav className="ml-auto flex gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cx(
                  "rounded-lg px-3 py-1.5 transition",
                  active ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
