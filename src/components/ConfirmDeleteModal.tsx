import { useEffect, useRef, useState } from 'react';

type ConfirmDeleteModalProps = {
  open: boolean;
  title: string;
  description?: string;
  expectedText: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function ConfirmDeleteModal({
  open,
  title,
  description,
  expectedText,
  confirmLabel = '삭제',
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInput('');
      setBusy(false);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const matched = input.trim() === expectedText.trim() && expectedText.trim() !== '';

  const handleConfirm = async () => {
    if (!matched || busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        {description && (
          <p className="mt-2 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">{description}</p>
        )}

        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-mono font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {expectedText}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
          }}
          placeholder="위 이름을 정확히 입력하세요"
          className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          disabled={busy}
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!matched || busy}
            className="cursor-pointer rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
          >
            {busy ? '삭제 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
