import React, {useEffect} from "react";
import {motion} from "framer-motion";
import {EASE_OUT} from "./motion";

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Overlay + dialog with matching enter/exit; children are the dialog body.
export default function Modal({onClose, role, labelledBy, children}: {
  onClose: () => void; role: "dialog" | "alertdialog"; labelledBy: string; children: React.ReactNode;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);
  // Callers pass inline arrows; keep the latest in a ref so the effect below runs only once on mount.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    // Focus first focusable element inside modal or dialog itself
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    } else {
      dialogRef.current?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        if (!dialogRef.current) return;
        const els = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, []);

  return (
      <motion.div className="overlay" onClick={onClose}
                  initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
                  transition={{duration: 0.15, ease: EASE_OUT}}>
        <motion.div ref={dialogRef} tabIndex={-1} className="dialog" role={role} aria-modal="true" aria-labelledby={labelledBy}
                    onClick={e => e.stopPropagation()}
                    initial={{opacity: 0, scale: 1.08}} animate={{opacity: 1, scale: 1}}
                    exit={{opacity: 0, scale: 0.96}}
                    transition={{duration: 0.2, ease: EASE_OUT}}>
          {children}
        </motion.div>
      </motion.div>
  );
}
