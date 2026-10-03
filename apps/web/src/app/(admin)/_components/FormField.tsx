"use client";

import { useId } from "react";
import { AlertCircle } from "lucide-react";

import { Input } from "@/components/ui/Input";

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
 * Reusable form field — label + input + hint / error message.
 *
 * Controlled component (parent owns state). Used by every form in the admin
 * panel (login, business settings, theme settings, menus/items). The control
 * itself is the shared `Input`, so borders, focus halo and invalid styling are
 * defined once. An error is announced with an icon + text, never colour alone.
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
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      <Input
        density="compact"
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
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
