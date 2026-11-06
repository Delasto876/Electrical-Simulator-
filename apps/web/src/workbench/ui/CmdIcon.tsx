import { createElement } from "react";
import type { LucideProps } from "lucide-react";
import { iconOf, type Cmd } from "../state/commandRegistry";

/** The icon of a command (it can depend on state, e.g. the current surface type). */
export function CmdIcon({ cmd, ...props }: { cmd: Cmd } & LucideProps) {
  return createElement(iconOf(cmd), props);
}
