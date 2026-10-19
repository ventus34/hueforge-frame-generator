import { useId, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';
import type { Lang } from '../utils/translations';

interface NumberInputProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  lang: Lang;
  disabled?: boolean;
  className?: string;
  onCommit: (value: number) => void;
}

function formatNumber(value: number): string {
  return String(value);
}

function parseDraft(draft: string): number | null {
  const normalized = draft.trim().replace(',', '.');
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function NumberInput({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  lang,
  disabled = false,
  className = 'numeric-input',
  onCommit
}: NumberInputProps) {
  const errorId = useId();
  const [draft, setDraft] = useState(() => formatNumber(value));
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelOnBlur = useRef(false);

  const commitDraft = (event: FocusEvent<HTMLInputElement>) => {
    setIsEditing(false);
    if (cancelOnBlur.current) {
      cancelOnBlur.current = false;
      setDraft(formatNumber(value));
      setError(null);
      return;
    }
    const parsed = parseDraft(event.currentTarget.value);
    if (parsed === null) {
      setError(lang === 'pl'
        ? 'Wpisz poprawną liczbę. Pozostawiono poprzednią wartość.'
        : 'Enter a valid number. Previous value kept.');
      return;
    }
    if (parsed < min || parsed > max) {
      setError(lang === 'pl'
        ? `Wartość musi mieścić się w zakresie ${min}–${max} mm. Pozostawiono poprzednią wartość.`
        : `Enter a value from ${min} to ${max} mm. Previous value kept.`);
      return;
    }
    const stepBase = min;
    const stepCount = (parsed - stepBase) / step;
    if (Math.abs(stepCount - Math.round(stepCount)) > 1e-8) {
      setError(lang === 'pl'
        ? `Użyj kroku ${step} mm. Pozostawiono poprzednią wartość.`
        : `Use increments of ${step} mm. Previous value kept.`);
      return;
    }

    setError(null);
    setDraft(formatNumber(parsed));
    onCommit(parsed);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.currentTarget.value);
    if (error) setError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      cancelOnBlur.current = true;
      event.currentTarget.blur();
    }
  };

  const handleFocus = () => {
    if (!error) setDraft(formatNumber(value));
    else setError(null);
    setIsEditing(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
      <input
        id={id}
        type="text"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        className={className}
        value={isEditing || error !== null ? draft : formatNumber(value)}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        autoComplete="off"
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        aria-label={label}
      />
      {error && (
        <span id={errorId} role="alert" style={{ color: 'var(--color-primary-hover)', fontSize: '0.7rem', maxWidth: '180px', textAlign: 'right' }}>
          {error}
        </span>
      )}
    </div>
  );
}
