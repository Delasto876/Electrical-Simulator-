import { useId, type ReactNode } from "react";

/**
 * Rich tooltip: a title, a one-line description, the shortcut, and (for a
 * disabled command) the reason. Shown on hover and keyboard focus; the
 * wrapper, not the button, is hovered, so disabled buttons still explain.
 */
export function Tip({
  title,
  body,
  shortcut,
  warn,
  children,
  side = "bottom",
}: {
  title: string;
  body?: string;
  shortcut?: string;
  /** A reason the command is disabled. */
  warn?: string | null;
  children: ReactNode;
  side?: "bottom" | "top" | "right";
}) {
  const id = useId();
  return (
    <span className="wb-tipwrap" aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className={`wb-tip wb-tip-${side}`}>
        <strong>
          {title}
          {shortcut && <kbd>{shortcut}</kbd>}
        </strong>
        {body && <span>{body}</span>}
        {warn && <span className="wb-tip-warn">{warn}</span>}
      </span>
    </span>
  );
}
