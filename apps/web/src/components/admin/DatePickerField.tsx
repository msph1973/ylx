import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface DatePickerFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Dates before this "YYYY-MM-DD" string are disabled and cannot be picked. */
  min?: string;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parses a "YYYY-MM-DD" string into numeric parts, or `null` if malformed/empty. */
export function parseYMD(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function formatYMD(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Today's date in the browser's local timezone, as parts — constructing a
 *  `Date` directly from a "YYYY-MM-DD" string (or comparing via
 *  `new Date(string)`) parses as UTC midnight, which can land on the wrong
 *  day for users west of UTC; this stays entirely in local-time arithmetic. */
function getLocalTodayParts(): { year: number; month: number; day: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function formatDisplayDate(value: string): string {
  const parts = parseYMD(value);
  if (!parts) return '';
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface DayCell {
  ymd: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

/** Builds a fixed 6-week (42-cell) grid for `year`/`month` (1-indexed). Cells
 *  outside the viewed month are filled in for alignment but always disabled —
 *  clicking to a different month is via the header's prev/next buttons only. */
export function buildMonthGrid(
  year: number,
  month: number,
  value: string,
  min: string | undefined,
  todayYMD: string
): DayCell[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: DayCell[] = [];

  for (let i = 0; i < firstWeekday; i++) {
    const day = daysInPrevMonth - firstWeekday + 1 + i;
    cells.push({ ymd: formatYMD(prevYear, prevMonth, day), day, inCurrentMonth: false, isToday: false, isSelected: false, isDisabled: true });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const ymd = formatYMD(year, month, day);
    cells.push({
      ymd,
      day,
      inCurrentMonth: true,
      isToday: ymd === todayYMD,
      isSelected: ymd === value,
      isDisabled: min ? ymd < min : false,
    });
  }

  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ ymd: formatYMD(nextYear, nextMonth, nextDay), day: nextDay, inCurrentMonth: false, isToday: false, isSelected: false, isDisabled: true });
    nextDay++;
  }

  return cells;
}

/**
 * Custom calendar dropdown for picking an event date — replaces the native
 * `<input type="date">` so the picker always matches the app's dark theme
 * and behaves consistently across browsers, instead of relying on the OS's
 * own (visually inconsistent, sometimes hard-to-discover) date widget.
 *
 * Disabled days (`min`) are greyed out directly in the grid, reinforcing the
 * "no past dates" rule visually rather than only via an invisible attribute.
 */
export function DatePickerField({ id, value, onChange, min }: DatePickerFieldProps) {
  const shouldReduceMotion = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const today = getLocalTodayParts();
  const todayYMD = formatYMD(today.year, today.month, today.day);
  // Year+month live in ONE state object: updating them separately would tempt
  // side-effectful updater calls (which StrictMode's dev double-invoke would
  // re-run, shifting the year twice across a Dec/Jan boundary).
  const [viewed, setViewed] = useState(() => parseYMD(value) ?? today);
  // Whether the popover opens upward — set when the trigger is too close to
  // the bottom of the viewport for the ~360px calendar to fit below it
  // (the popover lives inside the album modal's scrolling container, so
  // extending past the viewport bottom would clip it).
  const [flipUp, setFlipUp] = useState(false);

  const openPopover = () => {
    setViewed(parseYMD(value) ?? today);
    const rect = wrapperRef.current?.getBoundingClientRect();
    setFlipUp(rect ? window.innerHeight - rect.bottom < 380 : false);
    setIsOpen(true);
  };

  const closePopover = (refocusTrigger: boolean) => {
    setIsOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  };

  // Close on an outside click — a bubbling listener on the popover itself
  // wouldn't catch clicks elsewhere in the form, so this needs to watch the
  // whole document.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  // Send keyboard focus to the selected (or today's) day as soon as the grid
  // for it exists, so keyboard users don't have to Tab through every cell.
  useEffect(() => {
    if (!isOpen) return;
    const target =
      gridRef.current?.querySelector<HTMLButtonElement>('.dp-day-selected:not(:disabled)') ??
      gridRef.current?.querySelector<HTMLButtonElement>('.dp-day-today:not(:disabled)') ??
      gridRef.current?.querySelector<HTMLButtonElement>('.dp-day:not(:disabled)');
    target?.focus();
  }, [isOpen]);

  const goToPrevMonth = () => {
    setViewed((v) => (v.month === 1 ? { year: v.year - 1, month: 12, day: 1 } : { ...v, month: v.month - 1 }));
  };

  const goToNextMonth = () => {
    setViewed((v) => (v.month === 12 ? { year: v.year + 1, month: 1, day: 1 } : { ...v, month: v.month + 1 }));
  };

  const handleSelectDay = (cell: DayCell) => {
    if (cell.isDisabled) return;
    onChange(cell.ymd);
    closePopover(true);
  };

  const cells = buildMonthGrid(viewed.year, viewed.month, value, min, todayYMD);

  return (
    <div
      className="dp-wrapper"
      ref={wrapperRef}
      onKeyDown={(e) => {
        // Handled here (not a document listener) and stopped from bubbling
        // so Escape closes just the popover first — a second Escape press
        // then reaches the modal's own handler to close the whole dialog.
        if (e.key === 'Escape' && isOpen) {
          e.stopPropagation();
          closePopover(true);
        }
      }}
    >
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="dp-trigger form-input"
        onClick={() => (isOpen ? closePopover(false) : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className={value ? 'dp-value' : 'dp-placeholder'}>
          {value ? formatDisplayDate(value) : 'Select a date'}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={flipUp ? 'dp-popover dp-popover-up' : 'dp-popover'}
            role="dialog"
            aria-label="Choose a date"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : flipUp ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : flipUp ? 6 : -6 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.12 }}
          >
            <div className="dp-header">
              <button type="button" className="dp-nav" onClick={goToPrevMonth} aria-label="Previous month">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="dp-month-label">{MONTH_LABELS[viewed.month - 1]} {viewed.year}</span>
              <button type="button" className="dp-nav" onClick={goToNextMonth} aria-label="Next month">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div className="dp-weekdays">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className="dp-weekday">{label}</span>
              ))}
            </div>

            <div className="dp-grid" ref={gridRef}>
              {cells.map((cell) => (
                <button
                  key={cell.ymd}
                  type="button"
                  className={[
                    'dp-day',
                    cell.isToday && 'dp-day-today',
                    cell.isSelected && 'dp-day-selected',
                  ].filter(Boolean).join(' ')}
                  disabled={cell.isDisabled}
                  onClick={() => handleSelectDay(cell)}
                  aria-label={cell.inCurrentMonth ? formatDisplayDate(cell.ymd) : undefined}
                  aria-current={cell.isToday ? 'date' : undefined}
                >
                  {cell.day}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .dp-wrapper {
          position: relative;
        }

        .dp-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          font-family: inherit;
          cursor: pointer;
          text-align: left;
        }

        .dp-trigger:hover {
          border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-border));
        }

        .dp-value {
          color: var(--color-text);
        }

        .dp-placeholder {
          color: var(--color-text-muted);
        }

        .dp-trigger svg {
          flex-shrink: 0;
          color: var(--color-text-muted);
        }

        .dp-popover {
          position: absolute;
          top: calc(100% + var(--space-2));
          left: 0;
          z-index: var(--z-dropdown);
          width: 280px;
          background-color: var(--color-surface-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-3);
          box-shadow: 0 10px 15px -3px var(--overlay-shadow-dialog), 0 4px 6px -4px var(--overlay-shadow-dialog);
        }

        .dp-popover-up {
          top: auto;
          bottom: calc(100% + var(--space-2));
        }

        .dp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-2);
        }

        .dp-month-label {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text);
        }

        .dp-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: var(--color-text-muted);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background-color var(--transition-fast), color var(--transition-fast);
        }

        .dp-nav:hover {
          background-color: var(--color-bg);
          color: var(--color-text);
        }

        .dp-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          margin-bottom: var(--space-1);
        }

        .dp-weekday {
          text-align: center;
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          padding: var(--space-1) 0;
        }

        .dp-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 2px;
        }

        .dp-day {
          display: flex;
          align-items: center;
          justify-content: center;
          aspect-ratio: 1;
          border: none;
          background: transparent;
          color: var(--color-text);
          font-size: var(--text-sm);
          font-family: inherit;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background-color var(--transition-fast), color var(--transition-fast);
        }

        .dp-day:hover:not(:disabled) {
          background-color: var(--color-bg);
        }

        .dp-day:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 50%, transparent);
        }

        .dp-day:disabled {
          color: var(--color-text-muted);
          opacity: 0.35;
          cursor: not-allowed;
        }

        .dp-day-today:not(.dp-day-selected) {
          box-shadow: inset 0 0 0 1px var(--color-accent);
        }

        .dp-day-selected {
          background-color: var(--color-accent);
          color: var(--color-bg);
          font-weight: var(--font-medium);
        }

        @media (max-width: 480px) {
          .dp-popover {
            width: min(280px, calc(100vw - var(--space-8)));
          }
        }
      `}</style>
    </div>
  );
}
