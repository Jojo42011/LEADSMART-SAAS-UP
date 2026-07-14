import Link from "next/link";
import { site } from "@/lib/site";

/** Brand mark: a rising bar glyph plus the wordmark. */
export function Wordmark({
  dark = false,
  href = "/",
}: {
  dark?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2.5"
      aria-label={site.name}
    >
      <span className="flex h-6 w-6 items-end justify-center gap-[3px]">
        <span
          className={`w-[4px] rounded-sm transition-all duration-300 group-hover:h-3 h-2 ${dark ? "bg-white/40" : "bg-ink/30"}`}
        />
        <span
          className={`w-[4px] rounded-sm transition-all duration-300 group-hover:h-4.5 h-3.5 ${dark ? "bg-white/70" : "bg-ink/60"}`}
        />
        <span className="w-[4px] h-6 rounded-sm bg-accent" />
      </span>
      <span
        className={`text-[17px] font-semibold tracking-tight ${dark ? "text-white" : "text-ink"}`}
      >
        {site.name}
      </span>
    </Link>
  );
}
