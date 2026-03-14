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
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        className={className}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 top-full mt-1 flex flex-wrap gap-1.5
          bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600
          rounded-lg shadow-lg p-2 max-w-[90vw]">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className="px-3 py-2 cursor-pointer rounded-lg text-sm whitespace-nowrap
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
