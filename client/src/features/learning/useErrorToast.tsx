// useErrorToast.tsx
// Toast hook and container for transient learning errors

// Longer description (2-4 lines):
// - Exposes toast state and helpers for error, warning, and success messages.
// - Renders a lightweight stack of toasts with auto-dismiss.
// - Provides accessible roles for screen readers and dismiss actions.

// @see: client/src/features/learning/LearningPathContainer.tsx
// @note: Uses simple state instead of a toast library

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

type ToastType = 'error' | 'warning' | 'success';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE_TOASTS = 3;

export function useErrorToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeoutId = timeoutsRef.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete timeoutsRef.current[id];
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'error') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => {
        const next = [...prev, { id, message, type }];
        if (next.length <= MAX_VISIBLE_TOASTS) {
          return next;
        }
        const removed = next.slice(0, next.length - MAX_VISIBLE_TOASTS);
        removed.forEach((toast) => {
          const timeoutId = timeoutsRef.current[toast.id];
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            delete timeoutsRef.current[toast.id];
          }
        });
        return next.slice(next.length - MAX_VISIBLE_TOASTS);
      });
    },
    []
  );

  const showError = useCallback(
    (message: string) => showToast(message, 'error'),
    [showToast]
  );

  const showWarning = useCallback(
    (message: string) => showToast(message, 'warning'),
    [showToast]
  );

  const showSuccess = useCallback(
    (message: string) => showToast(message, 'success'),
    [showToast]
  );

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    toasts.forEach((toast) => {
      if (timeoutsRef.current[toast.id]) {
        return;
      }

      timeoutsRef.current[toast.id] = window.setTimeout(() => {
        dismissToast(toast.id);
      }, AUTO_DISMISS_MS);
    });

    return () => {
      Object.values(timeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeoutsRef.current = {};
    };
  }, [toasts, dismissToast]);

  return {
    toasts,
    showError,
    showWarning,
    showSuccess,
    dismissToast,
  };
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const toastTypeStyles: Record<ToastType, string> = {
  error: 'bg-destructive text-destructive-foreground',
  warning: 'bg-amber-500 text-white',
  success: 'bg-green-500 text-white',
};

const toastTypeIcons: Record<ToastType, string> = {
  error: 'Error',
  warning: 'Warning',
  success: 'Success',
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const orderedToasts = useMemo(() => [...toasts].reverse(), [toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {orderedToasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'px-4 py-3 rounded-lg shadow-lg flex items-center gap-3',
            'animate-in slide-in-from-right duration-300',
            toastTypeStyles[toast.type]
          )}
        >
          <span aria-hidden="true">{toastTypeIcons[toast.type]}</span>
          <span className="text-sm">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="ml-2 opacity-70 hover:opacity-100"
            aria-label="Dismiss notification"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
