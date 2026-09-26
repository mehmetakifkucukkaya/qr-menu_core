"use client";

import { useId } from "react";

interface FormFieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password" | "number" | "url" | "tel" | "search";
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Reusable form field — label + input + error message.
 *
 * Controlled component (parent owns state). Used by every form in the
 * admin panel (login, business settings, theme settings, menus/items in
 * Sprint 4B). Keeps the visual treatment consistent without dragging in
 * a form library for V1.
 */
export function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  required = false,
  placeholder,
  autoComplete,
  hint,
  disabled = false,
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium text-text"
      >
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-accent">
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={
          "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60" +
          (error ? " border-accent focus:border-accent focus:ring-accent/30" : "")
        }
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
