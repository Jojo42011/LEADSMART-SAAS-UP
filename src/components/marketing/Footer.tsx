import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { site } from "@/lib/site";

const columns = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Method", href: "/#method" },
      { label: "Compare", href: "/#compare" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "AI information", href: "/ai-information" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[minmax(0,5fr)_repeat(3,minmax(0,2fr))]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-muted">
              {site.tagline}. Research, writing, publishing and tracking,
              handled by one autonomous agent.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="label-mono text-muted/70">{col.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13.5px] text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-line pt-7 sm:flex-row sm:items-center">
          <p className="text-[12.5px] text-muted/70">
            &copy; {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <p className="label-mono text-muted/50">Built to rank</p>
        </div>
      </div>
    </footer>
  );
}
