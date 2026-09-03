import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (id: string, invalid: boolean) => ReactNode;
}

/**
 * Wraps a control with its label, hint and error text and wires up the
 * `id`/`aria-describedby` relationships so the form stays accessible.
 */
export function FieldShell({ label, hint, error, optional, className, children }: FieldShellProps) {
  const id = useId();
  return (
    <div className={['field', className ?? ''].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>
        {label} {optional && <span className="field__optional">(optional)</span>}
      </label>
      {children(id, Boolean(error))}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </div>
  );
}

type TextFieldProps = { label: string; hint?: string; error?: string; optional?: boolean; className?: string } & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ label, hint, error, optional, className, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {(id, invalid) => <input id={id} className="input" aria-invalid={invalid} {...rest} />}
    </FieldShell>
  );
}

type TextAreaFieldProps = { label: string; hint?: string; error?: string; optional?: boolean; className?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextAreaField({ label, hint, error, optional, className, ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {(id, invalid) => <textarea id={id} className="textarea" aria-invalid={invalid} {...rest} />}
    </FieldShell>
  );
}

type SelectFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  options: { value: string; label: string }[];
} & SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({ label, hint, error, optional, className, options, ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {(id, invalid) => (
        <select id={id} className="select" aria-invalid={invalid} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
