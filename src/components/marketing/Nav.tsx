"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/ui/Wordmark";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#method", label: "Method" },
  { href: "#features", label: "Features" },
  { href: "#ai-search", label: "AI search" },
  { href: "#compare", label: "Compare" },
  { href: "#pricing", label: "Pricing" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Coalesced to one read per frame, and only re-renders when the
    // boolean actually flips. The naive version ran a layout-reading
    // setState on every scroll event, which on a fixed header means work
    // on the compositor's critical path.
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = window.scrollY > 12;
        setScrolled((prev) => (prev === next ? prev : next));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    // Two deliberate performance choices on a fixed, full-width header:
    //
    // backdrop-blur-md rather than -xl. A backdrop filter forces the
    // browser to re-sample and re-blur everything behind the element on
    // every scrolled frame, and the cost scales with the blur radius; 24px
    // across the full viewport width is the classic source of scroll jank
    // on real hardware. 12px over a more opaque background is visually
    // near-identical and roughly half the work.
    //
    // transition-colors rather than transition-all. transition-all
    // animates the backdrop filter itself for 300ms on the scroll
    // threshold, which is the most expensive property on the element.
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-md border-b border-line"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Wordmark />

        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/signin"
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="group inline-flex items-center gap-1.5 rounded-full bg-ink px-4.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent"
          >
            Get started
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              &rarr;
            </span>
          </Link>
        </div>

        <button
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <span
            className={`h-px w-5 bg-ink transition-transform ${open ? "translate-y-[3.5px] rotate-45" : ""}`}
          />
          <span
            className={`h-px w-5 bg-ink transition-transform ${open ? "-translate-y-[3.5px] -rotate-45" : ""}`}
          />
        </button>
      </nav>

      {open && (
        <div className="border-t border-line bg-white px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm text-muted"
              >
                {l.label}
              </a>
            ))}
            <div className="flex items-center gap-4 pt-2">
              <Link href="/signin" className="text-sm text-muted">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
