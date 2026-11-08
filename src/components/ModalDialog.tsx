import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface ModalDialogProps {
  labelledBy: string;
  onClose: () => void;
  className: string;
  children: ReactNode;
}

// Mount only while open. The browser makes the background inert and returns focus on close.
export function ModalDialog({ labelledBy, onClose, className, children }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-dialog-autofocus="true"]')?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={`fixed inset-0 m-0 h-full w-full max-h-none max-w-none bg-transparent open:flex justify-center backdrop:bg-warm-900/60 backdrop:backdrop-blur-xs ${className}`}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const boundary = event.shiftKey ? 'first' : 'last';
        if (event.target !== event.currentTarget.querySelector(`[data-dialog-edge="${boundary}"]`)) return;
        const opposite = event.shiftKey ? 'last' : 'first';
        event.preventDefault();
        event.currentTarget.querySelector<HTMLElement>(`[data-dialog-edge="${opposite}"]`)?.focus();
      }}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      {children}
    </dialog>
  );
}
