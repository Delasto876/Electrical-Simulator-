import { useEffect, useRef, useState, type ReactNode } from "react";

/** A button that opens a menu below it. Closes on outside click, Escape and after a choice. */
export function Dropdown({
  button,
  children,
  label,
  className = "",
  align = "left",
  up = false,
}: {
  button: (p: { open: boolean; toggle: () => void; props: Record<string, unknown> }) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
  className?: string;
  align?: "left" | "right";
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);
  return (
    <span ref={root} className={`wb-dropdown ${className}`}>
      {button({
        open,
        toggle: () => setOpen((o) => !o),
        props: { "aria-haspopup": "menu", "aria-expanded": open },
      })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`wb-menu wb-menu-${align}${up ? " wb-menu-up" : ""}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}
