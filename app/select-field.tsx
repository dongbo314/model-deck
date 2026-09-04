'use client';

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

type Option = { value: string; label: string };
type SelectFieldProps = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
};

// Keep options in the page: Firefox's native select popup cannot use web fonts.
export function SelectField({ label, value, options, onChange, disabled = false, hideLabel = false, className = '' }: SelectFieldProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const searchRef = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 280 });
  const unavailable = disabled || options.length === 0;
  const expanded = open && !unavailable;
  const selectedIndex = options.findIndex((option) => option.value === value);
  const currentIndex = Math.min(activeIndex, Math.max(0, options.length - 1));

  function close(commit = false) {
    if (commit && expanded && options[currentIndex]) onChange(options[currentIndex].value);
    setOpen(false);
    searchRef.current = { text: '', time: 0 };
  }

  function show(index = Math.max(0, selectedIndex)) {
    setActiveIndex(index);
    setOpen(true);
  }

  useEffect(() => {
    if (!expanded) return;
    const positionMenu = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const below = window.innerHeight - bounds.bottom - (window.innerWidth <= 760 ? 100 : 12);
      const above = bounds.top - 12;
      const opensAbove = below < Math.min(240, above);
      setPlacement({ above: opensAbove, maxHeight: Math.max(48, Math.min(280, (opensAbove ? above : below) - 6)) });
    };
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    positionMenu();
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (expanded) optionRefs.current[currentIndex]?.scrollIntoView({ block: 'nearest' });
  }, [expanded, currentIndex, placement.maxHeight]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (unavailable || event.nativeEvent.isComposing) return;
    const { key } = event;
    if (key === 'Tab') {
      close(true);
      return;
    }
    if (key === 'Escape') {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (expanded) close(true);
      else show();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key)) {
      event.preventDefault();
      if (expanded && event.altKey && key === 'ArrowUp') {
        close(true);
        return;
      }
      const start = expanded ? currentIndex : Math.max(0, selectedIndex);
      const step = key === 'PageDown' ? 10 : key === 'PageUp' ? -10 : key === 'ArrowDown' ? 1 : -1;
      const index = key === 'Home' ? 0 : key === 'End' ? options.length - 1 : expanded ? start + step : start;
      show(Math.max(0, Math.min(options.length - 1, index)));
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const search = searchRef.current;
      const text = `${now - search.time < 700 ? search.text : ''}${key.toLocaleLowerCase()}`;
      searchRef.current = { text, time: now };
      const repeated = [...text].every((character) => character === text[0]);
      const prefix = repeated ? text[0] : text;
      const start = expanded ? currentIndex : Math.max(0, selectedIndex);
      for (let offset = repeated ? 1 : 0; offset <= options.length; offset += 1) {
        const index = (start + offset) % options.length;
        if (options[index].label.toLocaleLowerCase().startsWith(prefix)) {
          show(index);
          break;
        }
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={`select-field ${expanded ? 'is-open' : ''} ${className}`}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(true); }}
    >
      <label className={hideLabel ? 'sr-only' : undefined} id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
      <div className="select-anchor">
        <button
          ref={triggerRef}
          id={`${id}-trigger`}
          type="button"
          role="combobox"
          className="select-trigger"
          aria-labelledby={`${id}-label`}
          aria-controls={`${id}-listbox`}
          aria-haspopup="listbox"
          aria-expanded={expanded}
          aria-activedescendant={expanded ? `${id}-option-${currentIndex}` : undefined}
          disabled={unavailable}
          onClick={() => { searchRef.current = { text: '', time: 0 }; if (expanded) close(); else show(); }}
          onKeyDown={handleKeyDown}
        >
          <span>{options[selectedIndex]?.label || '\u00a0'}</span>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className={`select-options ${placement.above ? 'opens-above' : ''}`}
          style={{ maxHeight: placement.maxHeight }}
          hidden={!expanded}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              ref={(element) => { optionRefs.current[index] = element; }}
              role="option"
              aria-selected={expanded ? index === currentIndex : option.value === value}
              className="select-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(option.value); close(); triggerRef.current?.focus(); }}
            >
              <span>{option.label}</span>
              {option.value === value && <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
