"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Light/dark switch.
 *
 * The theme is applied by an inline script in the document head before
 * first paint (see layout.tsx), not here — a React effect runs after
 * hydration, which is late enough to show a full white flash to someone
 * who chose dark. This component only reflects and changes the choice the
 * script already applied.
 *
 * The initial state is read from the DOM rather than from storage, so the
 * button can never disagree with what is on screen: the script is the one
 * authority on which theme is active.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // The DOM attribute is the single source of truth — the head script owns
  // it — so this subscribes to it rather than mirroring it into state.
  // Copying it into state in an effect means a synchronous setState during
  // mount and two renders for something that was already correct on the
  // first one.
  const subscribe = useCallback((onChange: () => void) => {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const theme = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    // No server snapshot: the theme is not knowable until the head script
    // has read the visitor's stored choice, and guessing one would flip
    // the icon visibly on hydration for half of all users.
    () => null
  );

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    // Writing the attribute IS the state change; the observer above turns
    // it into a re-render.
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("ascent-theme", next);
    } catch {
      // Private browsing can refuse storage. The theme still applies for
      // this page load; it just will not be remembered.
    }
  };

  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-ink/40 hover:text-ink ${className}`}
    >
      {theme === null ? (
        <span className="h-4 w-4" aria-hidden="true" />
      ) : dark ? (
        // Sun: the action, not the state — pressing it returns to light.
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
