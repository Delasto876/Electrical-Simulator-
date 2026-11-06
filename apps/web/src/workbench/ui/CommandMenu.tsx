import { Check, ChevronDown } from "lucide-react";
import { COMMANDS, disabledReason, labelOf, runCommand, type Cmd } from "../state/commandRegistry";
import { CmdIcon } from "./CmdIcon";
import { Dropdown } from "./Dropdown";
import { Tip } from "./Tip";

/** The menu items of a dropdown command (its variants), each with a check when active and the reason when disabled. */
export function VariantItems({ cmd, close }: { cmd: Cmd; close: () => void }) {
  return (
    <>
      {(cmd.variants ?? []).map((vid) => {
        const v = COMMANDS[vid];
        if (!v) return null;
        const why = disabledReason(v);
        return (
          <button
            key={vid}
            type="button"
            role={v.pressed ? "menuitemradio" : "menuitem"}
            aria-checked={v.pressed ? v.pressed() : undefined}
            aria-disabled={!!why}
            title={why ?? v.description}
            className="wb-menuitem"
            data-testid={`cmd-${vid}`}
            onClick={() => {
              if (why) return void runCommand(vid);
              runCommand(vid);
              close();
            }}
          >
            <span className="wb-menuitem-check">{v.pressed?.() ? <Check size={14} /> : null}</span>
            <CmdIcon cmd={v} size={14} aria-hidden />
            <span className="wb-menuitem-label">{labelOf(v)}</span>
            {why && (
              <span className="wb-menuitem-why">
                {why.replace(/^Arrives in /, "Phase ").replace(/ \(.*$/, "")}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

/** A compact dropdown command button (nav bar, status bar, app bar). */
export function CommandDropdown({
  id,
  up = false,
  showLabel = true,
}: {
  id: string;
  up?: boolean;
  showLabel?: boolean;
}) {
  const cmd = COMMANDS[id]!;
  const why = disabledReason(cmd);
  return (
    <Dropdown
      label={cmd.description}
      up={up}
      button={({ toggle, props }) => (
        <Tip
          title={labelOf(cmd)}
          body={cmd.description}
          shortcut={cmd.shortcut}
          warn={why}
          side={up ? "top" : "bottom"}
        >
          <button
            type="button"
            className="wb-btn wb-btn-compact"
            onClick={toggle}
            disabled={!!why}
            data-testid={`cmd-${id}`}
            {...props}
          >
            <CmdIcon cmd={cmd} size={15} aria-hidden />
            {showLabel && <span>{labelOf(cmd)}</span>}
            <ChevronDown size={12} aria-hidden />
          </button>
        </Tip>
      )}
    >
      {(close) => <VariantItems cmd={cmd} close={close} />}
    </Dropdown>
  );
}
