import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";

function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);
  return ref;
}

/* ---------------- Modal ---------------- */
export function Modal({ open, title, onClose, children, footer, width = "max-w-lg" }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useDialog<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={onClose}>
        <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={cx("w-full bg-white rounded-lg shadow-2xl border border-slate-200 outline-none", width)} onClick={(e) => e.stopPropagation()}>
          <header className="flex items-center justify-between px-4 h-11 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-base leading-none" aria-label="关闭">×</button>
          </header>
          <div className="p-4 max-h-[70vh] overflow-y-auto">{children}</div>
          {footer && <footer className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">{footer}</footer>}
        </div>
      </div>
    </Portal>
  );
}

/* ---------------- Drawer ---------------- */
export function Drawer({ open, title, onClose, children, footer, width = "w-[480px]" }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useDialog<HTMLElement>(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-slate-900/40" onClick={onClose}>
        <aside ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={cx("absolute right-0 top-0 h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col outline-none", width)} onClick={(e) => e.stopPropagation()}>
          <header className="flex items-center justify-between px-4 h-11 border-b border-slate-100 shrink-0">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-base leading-none" aria-label="关闭">×</button>
          </header>
          <div className="p-4 overflow-y-auto flex-1">{children}</div>
          {footer && <footer className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 shrink-0">{footer}</footer>}
        </aside>
      </div>
    </Portal>
  );
}

/* ---------------- Toast ---------------- */
export function ToastStack({ items }: { items: { id: number; message: string }[] }) {
  return (
    <Portal>
      <div role="status" aria-live="polite" className="fixed left-5 bottom-5 z-[60] space-y-2 pointer-events-none">
        {items.map((t) => (
          <div key={t.id} className="px-4 py-2.5 rounded-md bg-slate-900 text-white text-xs shadow-xl max-w-sm">{t.message}</div>
        ))}
      </div>
    </Portal>
  );
}
