import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Icon } from './icons';

type ToastItem = { id: number; text: string; tone: 'success' | 'error' };
const Ctx = createContext<(text: string, tone?: 'success' | 'error') => void>(() => {});

/** Success toasts at the top of the screen (UI_UX §1.4). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-lg px-4 py-3 text-paper shadow-lg ${t.tone === 'success' ? 'bg-charcoal' : 'bg-danger'}`}
          >
            <Icon name={t.tone === 'success' ? 'check' : 'alert'} className="size-5 text-copper" />
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
