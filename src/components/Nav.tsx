"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Emblem } from "./Emblem";
import { IconBook, IconRadar, IconSearch, IconUser } from "./icons";
import { ThemeToggle } from "./Theme";
import { Kbd, cx } from "./ui";

const LINKS = [
  { href: "/", label: "Analyze", Icon: IconSearch },
  { href: "/scan", label: "Scan", Icon: IconRadar },
  { href: "/memory", label: "Memory", Icon: IconBook },
  { href: "/profile", label: "Profile", Icon: IconUser },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();

  // ⌘K / Ctrl+K: jump to the URL field from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (path === "/") window.dispatchEvent(new Event("shield:focus"));
        else router.push("/?focus=1");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, router]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg font-semibold tracking-tight" aria-label="Opportunity Shield home">
          <Emblem />
          <span className="hidden sm:inline">Opportunity Shield</span>
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-0.5 text-sm">
          {LINKS.map(({ href, label, Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={cx(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition sm:px-3",
                  active ? "bg-surface-2 text-text ring-1 ring-inset ring-line-strong" : "text-muted hover:text-text",
                )}
              >
                <Icon size={16} className={active ? "text-brand" : undefined} />
                <span className="hidden min-[420px]:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-1 text-xs text-faint lg:flex" aria-hidden>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6">
      <div className="flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>
            <span className="font-semibold tracking-wide text-text">NVIDIA</span> Nemotron on <span className="font-semibold text-text">Nebius</span> Token Factory
          </span>
          <span className="text-faint" aria-hidden>
            ·
          </span>
          <span>
            web data by <span className="font-semibold text-text">Tavily</span>
          </span>
          <span className="text-faint" aria-hidden>
            ·
          </span>
          <span>MIT licensed</span>
        </div>
        <a href="https://github.com/alexpanwien512-png/opportunity-shield" className="rounded hover:text-text" target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
      </div>
    </footer>
  );
}
