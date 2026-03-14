import { useState, useRef, useEffect } from 'react';

interface Props {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function LocationComboBox({ value, options, onChange, className = '', placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(
    (o) => o && o !== value && o.toLowerCase().includes(value.toLowerCase()),
  );

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        role="combobox"
        aria-expanded={open}
        className={className}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div
          role="listbox"
          className="absolute z-50 bottom-full mb-1 left-0 right-0
          flex flex-wrap gap-1 bg-white dark:bg-gray-800
          border border-gray-300 dark:border-gray-600
          rounded-lg shadow-lg p-1.5">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              className="px-2.5 py-1.5 cursor-pointer rounded text-sm whitespace-nowrap
                bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600
                text-gray-700 dark:text-gray-300
                active:bg-blue-100 dark:active:bg-blue-900/40
                hover:bg-blue-50 dark:hover:bg-blue-900/20"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
