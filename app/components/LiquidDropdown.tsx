'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export interface LiquidDropdownOption {
  id: string | number;
  name: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

interface LiquidDropdownProps {
  label: string;
  title?: string;
  options: LiquidDropdownOption[];
  value: string | number;
  onChange: (val: string) => void;
  className?: string;
  align?: 'left' | 'right';
  pillClassName?: string;
  isHighlightActive?: boolean;
  icon?: ReactNode;
  menuWidth?: string;
  enableHover?: boolean;
}

export default function LiquidDropdown({
  label,
  title,
  options,
  value,
  onChange,
  className = "min-w-[150px]",
  align = 'left',
  pillClassName,
  isHighlightActive,
  icon,
  menuWidth,
  enableHover = true,
}: LiquidDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((o) => String(o.id) === String(value));
  const displayLabel = selectedOption ? selectedOption.name : label;
  const isSelectedActive = isHighlightActive ?? (Boolean(value) && String(value) !== '' && String(value) !== 'all');

  return (
    <div
      ref={dropdownRef}
      className={clsx(
        'relative inline-block',
        enableHover && 'group/liquid-dropdown',
        isOpen ? 'z-50' : 'z-20 group-hover/liquid-dropdown:z-50',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={pillClassName || clsx(
          'w-full flex items-center justify-between gap-2.5 px-4 sm:px-4.5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold transition-all select-none min-h-[42px] sm:min-h-[44px] cursor-pointer shadow-md',
          isSelectedActive
            ? 'liquid-glass-pill-active font-bold shadow-sm text-white'
            : 'liquid-glass-pill text-neutral-200 hover:text-white'
        )}
      >
        <span className="truncate drop-shadow-sm flex items-center gap-2">
          {icon && <span className="w-4.5 h-4.5 shrink-0 flex items-center justify-center text-neutral-300">{icon}</span>}
          <span className="truncate">{displayLabel}</span>
        </span>
        <ChevronDown
          className={clsx(
            'w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 shrink-0',
            isOpen
              ? 'rotate-180 text-white'
              : enableHover
              ? 'group-hover/liquid-dropdown:rotate-180 group-hover/liquid-dropdown:text-white'
              : ''
          )}
        />
      </button>

      <div
        role="listbox"
        className={clsx(
          'absolute top-full mt-2 liquid-glass-menu rounded-2xl shadow-2xl p-1.5 max-w-[calc(100vw-2rem)] max-h-[480px] max-h-[75vh] overflow-y-auto scrollbar-thin transition-all duration-200 z-50 before:absolute before:-top-3 before:left-0 before:right-0 before:h-3 before:content-[""]',
          align === 'right' ? 'right-0' : 'left-0',
          menuWidth || 'w-56 min-w-[180px]',
          isOpen
            ? 'opacity-100 visible'
            : enableHover
            ? 'opacity-0 invisible group-hover/liquid-dropdown:opacity-100 group-hover/liquid-dropdown:visible'
            : 'hidden'
        )}
      >
        {title && (
          <div className="px-3.5 py-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-300 border-b border-white/10 sticky top-0 bg-neutral-900/95 backdrop-blur-xl rounded-t-xl z-10">
            {title}
          </div>
        )}
        <div className="space-y-0.5 pt-0.5">
          {options.map((opt, idx) => {
            const isSelected = String(opt.id) === String(value);
            return (
              <button
                key={`${opt.id}-${idx}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(String(opt.id));
                  setIsOpen(false);
                }}
                className={clsx(
                  'w-full text-left px-3.5 py-2.5 text-sm sm:text-base rounded-xl transition-all flex items-center justify-between font-medium cursor-pointer liquid-dropdown-item',
                  isSelected
                    ? 'liquid-dropdown-item-active text-white font-bold'
                    : 'text-neutral-200 hover:text-white'
                )}
              >
                <span className="truncate drop-shadow-sm flex items-center gap-2">
                  {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                  <span className="truncate">{opt.name}</span>
                  {opt.badge && <span className="shrink-0 ml-1">{opt.badge}</span>}
                </span>
                {isSelected && <span className="text-xs font-bold shrink-0 ml-2">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
