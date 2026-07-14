"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

type FieldProps = {
  label: string;
  hint?: string;
  optional?: boolean;
} & InputHTMLAttributes<HTMLInputElement>;

export function Field({ label, hint, optional, ...props }: FieldProps) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {optional && (
          <span className="label-mono text-[10px] text-muted/60">Optional</span>
        )}
      </span>
      <input
        {...props}
        className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-[14.5px] text-ink outline-none transition-all placeholder:text-muted/50 focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
      />
      {hint && <span className="mt-1.5 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export function StepHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: ReactNode;
  sub: string;
}) {
  return (
    <div>
      <span className="label-mono text-accent">{eyebrow}</span>
      <h1 className="font-display mt-3 text-[32px] leading-[1.1] tracking-tight sm:text-[40px]">
        {title}
      </h1>
      <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-muted">
        {sub}
      </p>
    </div>
  );
}

export function ChoiceCard({
  selected,
  onClick,
  title,
  text,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  text: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-4 rounded-xl border p-5 text-left transition-all ${
        selected
          ? "border-ink bg-ink text-white shadow-lg shadow-black/10"
          : "border-line bg-white hover:border-ink/40"
      }`}
    >
      {icon && (
        <span
          className={`mt-0.5 block h-6 w-6 shrink-0 [&>svg]:h-full [&>svg]:w-full ${
            selected ? "text-white" : "text-ink/70"
          }`}
        >
          {icon}
        </span>
      )}
      <span>
        <span className="flex items-center gap-2 text-[15px] font-medium">
          {title}
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        </span>
        <span
          className={`mt-1 block text-[13px] leading-relaxed ${
            selected ? "text-white/60" : "text-muted"
          }`}
        >
          {text}
        </span>
      </span>
    </button>
  );
}
