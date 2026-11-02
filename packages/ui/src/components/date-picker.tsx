'use client';

import { useId, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface DatePickerLabels {
  clearDate?: string;
  openCalendar?: string;
  previousMonth?: string;
  nextMonth?: string;
  timeLabel?: string;
  done?: string;
  placeholder?: string;
}

export interface DatePickerProps {
  id?: string;
  name?: string;
  value?: string | null;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  showTime?: boolean;
  minDate?: string | Date;
  maxDate?: string | Date;
  className?: string;
  ariaLabel?: string;
  locale?: string;
  labels?: DatePickerLabels;
}

const DEFAULT_LABELS: Required<DatePickerLabels> = {
  clearDate: 'Clear date',
  openCalendar: 'Open calendar',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  timeLabel: 'Time:',
  done: 'Done',
  placeholder: 'Select date…',
};

function getMonthNames(locale: string = 'en'): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long' });
  return Array.from({ length: 12 }, (_, i) => formatter.format(new Date(2026, i, 1)));
}

function getWeekdayNames(locale: string = 'en'): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2026, 0, 4 + i)));
}

function parseISODate(val: string | null | undefined): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
} | null {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hours: d.getHours(),
    minutes: d.getMinutes(),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function DatePicker({
  id: explicitId,
  name,
  value,
  onChange,
  placeholder,
  disabled = false,
  invalid = false,
  showTime = false,
  minDate,
  maxDate,
  className,
  ariaLabel,
  locale = 'en',
  labels,
}: DatePickerProps) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;
  const [open, setOpen] = useState(false);

  const resolvedLabels = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);

  const monthNames = useMemo(() => getMonthNames(locale), [locale]);
  const weekdayNames = useMemo(() => getWeekdayNames(locale), [locale]);

  const parsed = useMemo(() => parseISODate(value), [value]);

  const [viewYear, setViewYear] = useState(() => parsed?.year ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsed?.month ?? new Date().getMonth());

  const [timeHours, setTimeHours] = useState(() => parsed?.hours ?? 0);
  const [timeMinutes, setTimeMinutes] = useState(() => parsed?.minutes ?? 0);

  const minD = useMemo(() => (minDate ? new Date(minDate) : null), [minDate]);
  const maxD = useMemo(() => (maxDate ? new Date(maxDate) : null), [maxDate]);

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      year: number;
      month: number;
      day: number;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    const today = new Date();
    const isToday = (y: number, m: number, d: number) =>
      today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;

    const isSelected = (y: number, m: number, d: number) =>
      parsed !== null && parsed.year === y && parsed.month === m && parsed.day === d;

    const isDateDisabled = (y: number, m: number, d: number) => {
      const target = new Date(y, m, d, 23, 59, 59, 999);
      if (minD && target < new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())) {
        return true;
      }
      if (maxD && new Date(y, m, d) > maxD) {
        return true;
      }
      return false;
    };

    // Leading days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({
        year: y,
        month: m,
        day: d,
        isCurrentMonth: false,
        isDisabled: isDateDisabled(y, m, d),
        isSelected: isSelected(y, m, d),
        isToday: isToday(y, m, d),
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      days.push({
        year: viewYear,
        month: viewMonth,
        day: d,
        isCurrentMonth: true,
        isDisabled: isDateDisabled(viewYear, viewMonth, d),
        isSelected: isSelected(viewYear, viewMonth, d),
        isToday: isToday(viewYear, viewMonth, d),
      });
    }

    // Trailing days from next month to fill grid (up to 42 cells)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({
        year: y,
        month: m,
        day: d,
        isCurrentMonth: false,
        isDisabled: isDateDisabled(y, m, d),
        isSelected: isSelected(y, m, d),
        isToday: isToday(y, m, d),
      });
    }

    return days;
  }, [viewYear, viewMonth, parsed, minD, maxD]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: { year: number; month: number; day: number }) => {
    const y = day.year;
    const m = pad(day.month + 1);
    const d = pad(day.day);
    if (showTime) {
      const val = `${y}-${m}-${d}T${pad(timeHours)}:${pad(timeMinutes)}`;
      onChange?.(val);
    } else {
      const val = `${y}-${m}-${d}`;
      onChange?.(val);
      setOpen(false);
    }
  };

  const handleTimeChange = (newHours: number, newMinutes: number) => {
    setTimeHours(newHours);
    setTimeMinutes(newMinutes);
    if (parsed) {
      const y = parsed.year;
      const m = pad(parsed.month + 1);
      const d = pad(parsed.day);
      const val = `${y}-${m}-${d}T${pad(newHours)}:${pad(newMinutes)}`;
      onChange?.(val);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
  };

  return (
    <div className={cn('relative w-full flex items-center', className)}>
      <input
        type="text"
        id={id}
        name={name}
        disabled={disabled}
        placeholder={placeholder ?? resolvedLabels.placeholder ?? 'Select date…'}
        value={value ?? ''}
        onChange={(e) => {
          onChange?.(e.target.value);
        }}
        aria-label={ariaLabel ?? placeholder ?? resolvedLabels.placeholder}
        className={cn(
          'flex h-9 w-full rounded-md border bg-background px-3 py-1.5 pr-14 text-xs shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-destructive' : 'border-border',
        )}
      />
      <div className="absolute right-2 flex items-center gap-1 shrink-0">
        {value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={handleClear}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={resolvedLabels.clearDate}
            aria-label={resolvedLabels.clearDate}
          >
            <X className="size-3" />
          </button>
        )}
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (disabled) return;
            setOpen(next);
            if (next && parsed) {
              setViewYear(parsed.year);
              setViewMonth(parsed.month);
              setTimeHours(parsed.hours);
              setTimeMinutes(parsed.minutes);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={resolvedLabels.openCalendar}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CalendarIcon className="size-3.5" />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={4}
            hideClose
            className="w-auto p-3 shadow-lg z-[60]"
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-1 border-b border-border">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={resolvedLabels.previousMonth}
                aria-label={resolvedLabels.previousMonth}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-xs font-semibold text-foreground">
                {monthNames[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={resolvedLabels.nextMonth}
                aria-label={resolvedLabels.nextMonth}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {weekdayNames.map((w, idx) => (
                <span
                  key={`${w}-${idx}`}
                  className="text-[10px] font-medium text-muted-foreground py-0.5"
                >
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarDays.map((d, idx) => (
                <button
                  key={`${d.year}-${d.month}-${d.day}-${idx}`}
                  type="button"
                  disabled={d.isDisabled}
                  onClick={() => handleSelectDay(d)}
                  className={cn(
                    'size-7 text-xs rounded-md flex items-center justify-center font-normal transition-colors',
                    d.isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
                    d.isToday && !d.isSelected && 'border border-primary/40 font-medium',
                    d.isSelected &&
                      'bg-primary text-primary-foreground font-semibold hover:bg-primary',
                    !d.isSelected && !d.isDisabled && 'hover:bg-muted',
                    d.isDisabled && 'opacity-30 cursor-not-allowed hover:bg-transparent',
                  )}
                >
                  {d.day}
                </button>
              ))}
            </div>

            {showTime && (
              <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground text-[11px] font-medium">
                  {resolvedLabels.timeLabel}
                </span>
                <div className="flex items-center gap-1">
                  <select
                    value={timeHours}
                    onChange={(e) => handleTimeChange(Number(e.target.value), timeMinutes)}
                    className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {pad(i)}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground font-bold">:</span>
                  <select
                    value={timeMinutes}
                    onChange={(e) => handleTimeChange(timeHours, Number(e.target.value))}
                    className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>
                        {pad(i)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="ml-2 h-7 px-2.5 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90"
                  >
                    {resolvedLabels.done}
                  </button>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
