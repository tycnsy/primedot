import { useEffect } from 'react';

interface ModalShellProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClassName?: string;
}

export default function ModalShell({
  open,
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-[560px]',
}: ModalShellProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={`w-full overflow-hidden rounded-[14px] border border-border bg-surface shadow-elev2 ${maxWidthClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/80 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost !px-2 !py-1">
            Esc
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border/80 bg-surface2/40 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
