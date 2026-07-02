'use client';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        pointerEvents: 'none',
      }}>
        {toasts.map(t => {
          const colors = {
            success: { bg: '#065f46', border: '#10b981', icon: CheckCircle },
            error: { bg: '#7f1d1d', border: '#ef4444', icon: XCircle },
            warning: { bg: '#78350f', border: '#f59e0b', icon: AlertTriangle },
          };
          const c = colors[t.type];
          const Icon = c.icon;
          return (
            <div
              key={t.id}
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: 'white',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                minWidth: '280px',
                maxWidth: '420px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                pointerEvents: 'auto',
                animation: 'toastSlide 0.3s cubic-bezier(0.16,1,0.3,1)',
                fontSize: '0.95rem',
                fontWeight: 500,
              }}
            >
              <Icon size={20} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastSlide {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
