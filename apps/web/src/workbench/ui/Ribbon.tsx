import { ChevronDown } from "lucide-react";
import {
  COMMANDS,
  RIBBON,
  disabledReason,
  labelOf,
  runCommand,
  type Cmd,
  type RibbonPanel,
} from "../state/commandRegistry";
import { useWb } from "../state/wbStore";
import { useView } from "../state/wbView";
import { Dropdown } from "./Dropdown";
import { VariantItems } from "./CommandMenu";
import { CmdIcon } from "./CmdIcon";
import { toneOf } from "./IconTones";
import { Tip } from "./Tip";

function RibbonButton({ cmd }: { cmd: Cmd }) {
  const why = disabledReason(cmd);
  const pressed = cmd.pressed?.();
  const inner = (
    <>
      <CmdIcon cmd={cmd} size={22} strokeWidth={1.6} aria-hidden />
      <span className="wb-rb-label">{labelOf(cmd)}</span>
    </>
  );
  if (cmd.variants)
    return (
      <Dropdown
        label={`${labelOf(cmd)} options`}
        className="wb-rb-wrap"
        button={({ toggle, props }) => (
          <Tip title={labelOf(cmd)} body={cmd.description} shortcut={cmd.shortcut} warn={why}>
            <button
              type="button"
              className="wb-rb"
              disabled={!!why}
              onClick={toggle}
              data-testid={`cmd-${cmd.id}`}
              {...props}
            >
              {inner}
              <ChevronDown size={11} className="wb-rb-caret" aria-hidden />
            </button>
          </Tip>
        )}
      >
        {(close) => <VariantItems cmd={cmd} close={close} />}
      </Dropdown>
    );
  return (
    <Tip title={labelOf(cmd)} body={cmd.description} shortcut={cmd.shortcut} warn={why}>
      <button
        type="button"
        className={`wb-rb${pressed ? " is-pressed" : ""}${why ? " is-off" : ""}`}
        aria-pressed={cmd.pressed ? !!pressed : undefined}
        aria-disabled={!!why}
        onClick={() => runCommand(cmd.id)}
        data-testid={`cmd-${cmd.id}`}
      >
        {inner}
      </button>
    </Tip>
  );
}

/** Fusion-style group title: CREATE ▾ opens every command of the group. */
function GroupMenu({ panel }: { panel: RibbonPanel }) {
  const ids = [...panel.items.map((i) => i.id), ...(panel.more ?? [])];
  const pseudo: Cmd = {
    id: `group.${panel.label}`,
    label: panel.label,
    icon: COMMANDS[ids[0]!]!.icon,
    description: `${panel.label} commands`,
    variants: ids.filter((id) => COMMANDS[id]),
  };
  return (
    <Dropdown
      label={`${panel.label} menu`}
      className="wb-group-wrap"
      button={({ toggle, props }) => (
        <button
          type="button"
          className="wb-ribbon-panel-label wb-group-title"
          onClick={toggle}
          data-testid={`group-${panel.label.toLowerCase()}`}
          {...props}
        >
          {panel.label} <ChevronDown size={10} aria-hidden />
        </button>
      )}
    >
      {(close) => <VariantItems cmd={pseudo} close={close} />}
    </Dropdown>
  );
}

/** Ribbon: tabs of the active workspace, then labelled panels of large icon+label buttons. */
export function Ribbon() {
  // re-render on any document or view change (labels, pressed and disabled states read the stores)
  useWb((s) => s.revision + s.cursor);
  const ws = useView((s) => s.workspace);
  const tabId = useView((s) => s.ribbonTab[ws]);
  useView((s) => s);
  const tabs = RIBBON[ws];
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]!;
  return (
    <section className="wb-ribbon" aria-label="Ribbon">
      <div role="tablist" aria-label={`${ws} ribbon tabs`} className="wb-ribbon-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab.id}
            className="wb-ribbon-tab"
            data-testid={`ribbon-tab-${t.id}`}
            onClick={() =>
              useView.getState().set({ ribbonTab: { ...useView.getState().ribbonTab, [ws]: t.id } })
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="wb-ribbon-panels" aria-label={tab.label}>
        {tab.panels.map((p, i) => (
          <div
            key={p.label}
            className="wb-ribbon-panel"
            role="group"
            aria-label={p.label}
            data-tone={toneOf(p.label, i)}
          >
            <div className="wb-ribbon-items">
              {p.items.map((it) => {
                const c = COMMANDS[it.id];
                return c ? <RibbonButton key={it.id} cmd={c} /> : null;
              })}
            </div>
            {p.more ? (
              <GroupMenu panel={p} />
            ) : (
              <div className="wb-ribbon-panel-label">{p.label}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
