import { useRef, useState } from "react";
import {
  FilePlus,
  FolderOpen,
  Info,
  Keyboard,
  Menu as MenuIcon,
  Redo2,
  Save,
  Search,
  Sun,
  Moon,
  Undo2,
  ExternalLink,
  LayoutGrid,
} from "lucide-react";
import { saveFile } from "../../lib/saveFile";
import { COMMANDS, labelOf, runCommand } from "../state/commandRegistry";
import { customPartsFromFile } from "../model/customPackage";
import { customPartList, useCustomParts } from "../state/customParts";
import { parseFileFull, serializeFile, WbFileError } from "../state/wbFile";
import { newDoc } from "../state/wbDoc";
import { useDoc, useWb } from "../state/wbStore";
import { showToast, useView, WORKSPACES, WORKSPACE_LABEL } from "../state/wbView";
import { Dropdown } from "./Dropdown";
import { Tip } from "./Tip";

function fileStem(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "workbench"
  ).slice(0, 50);
}

export async function saveProject(): Promise<void> {
  const snap = useWb.getState().snapshot();
  try {
    const name = `${fileStem(useWb.getState().docs[useWb.getState().cursor]!.name)}.solarbench.json`;
    await saveFile(serializeFile(snap, customPartList()), name, "application/json");
    showToast(`Saved ${name}`);
  } catch (e) {
    showToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "warn");
  }
}

export function newProject(): void {
  useView.getState().set({
    confirm: {
      message:
        "Start a new empty workbench? The current one stays in this browser's autosave only until you change something.",
      okLabel: "New workbench",
      onOk: () => {
        useWb.getState().reset(newDoc());
        useView.getState().set({
          selection: null,
          isolated: null,
          section: { ...useView.getState().section, enabled: false },
        });
        showToast("New workbench");
      },
    },
  });
}

/** App bar: menu, project name, undo/redo, save, workspace tabs, command search, settings. */
export function AppBar() {
  const doc = useDoc();
  const cursor = useWb((s) => s.cursor);
  const count = useWb((s) => s.entries.length);
  const ws = useView((s) => s.workspace);
  const theme = useView((s) => s.theme);
  const input = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);

  const commitName = () => {
    if (name !== null) useWb.getState().dispatch({ type: "doc.rename", name }, { merge: true });
    setName(null);
  };
  const open = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { snapshot, customParts } = parseFileFull(JSON.parse(await f.text()));
      const embedded = customPartsFromFile(customParts);
      useCustomParts.getState().merge(embedded.parts);
      embedded.problems.forEach((p) => showToast(p, "warn"));
      useWb.getState().reset(snapshot);
      useView.getState().set({ selection: null });
      showToast(`Opened ${f.name}`);
    } catch (e) {
      showToast(
        `Could not open ${f.name}: ${e instanceof WbFileError ? e.message : String(e)}`,
        "warn",
      );
    }
  };

  return (
    <header className="wb-appbar">
      <Dropdown
        label="Main menu"
        button={({ toggle, props }) => (
          <Tip title="Menu" body="New, open, save, shortcuts, about.">
            <button
              type="button"
              className="wb-iconbtn"
              onClick={toggle}
              aria-label="Main menu"
              data-testid="main-menu"
              {...props}
            >
              <MenuIcon size={18} />
            </button>
          </Tip>
        )}
      >
        {(close) => (
          <>
            <button
              type="button"
              role="menuitem"
              className="wb-menuitem"
              onClick={() => {
                close();
                newProject();
              }}
            >
              <FilePlus size={14} /> <span className="wb-menuitem-label">New workbench</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="wb-menuitem"
              onClick={() => {
                close();
                file.current?.click();
              }}
            >
              <FolderOpen size={14} /> <span className="wb-menuitem-label">Open…</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="wb-menuitem"
              data-testid="menu-save"
              onClick={() => {
                close();
                void saveProject();
              }}
            >
              <Save size={14} /> <span className="wb-menuitem-label">Save as file</span>
            </button>
            <hr />
            <button
              type="button"
              role="menuitem"
              className="wb-menuitem"
              onClick={() => {
                close();
                runCommand("app.shortcuts");
              }}
            >
              <Keyboard size={14} /> <span className="wb-menuitem-label">Keyboard shortcuts</span>
              <kbd>?</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              className="wb-menuitem"
              onClick={() => {
                close();
                runCommand("app.about");
              }}
            >
              <Info size={14} /> <span className="wb-menuitem-label">About and disclaimer</span>
            </button>
            <a
              role="menuitem"
              className="wb-menuitem"
              href="#/classic"
              onClick={() => setTimeout(() => window.location.reload(), 0)}
              title="The first-generation roof-based designer, kept until its features move over"
            >
              <ExternalLink size={14} />{" "}
              <span className="wb-menuitem-label">Classic designer (v1)</span>
            </a>
          </>
        )}
      </Dropdown>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="wb-brand" aria-hidden>
        <LayoutGrid size={16} /> <span>Solar Workbench</span>
      </div>
      <label className="wb-projectname">
        <span className="wb-sr">Project name</span>
        <input
          ref={input}
          aria-label="Project name"
          data-testid="project-name"
          value={name ?? doc.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") input.current?.blur();
            if (e.key === "Escape") setName(null);
          }}
        />
      </label>

      <div className="wb-appbar-group">
        <Tip
          title="Undo"
          shortcut="Ctrl+Z"
          body={cursor > 0 ? "Undo the last command." : "Nothing to undo."}
        >
          <button
            type="button"
            className="wb-iconbtn"
            aria-label="Undo"
            disabled={cursor === 0}
            onClick={() => useWb.getState().undo()}
            data-testid="undo"
          >
            <Undo2 size={16} />
          </button>
        </Tip>
        <Tip
          title="Redo"
          shortcut="Ctrl+Shift+Z"
          body={cursor < count ? "Redo the command you undid." : "Nothing to redo."}
        >
          <button
            type="button"
            className="wb-iconbtn"
            aria-label="Redo"
            disabled={cursor >= count}
            onClick={() => useWb.getState().redo()}
            data-testid="redo"
          >
            <Redo2 size={16} />
          </button>
        </Tip>
        <Tip
          title="Save as file"
          body="Download the workbench with its whole history as a .json file."
        >
          <button
            type="button"
            className="wb-iconbtn"
            aria-label="Save as file"
            onClick={() => void saveProject()}
            data-testid="save"
          >
            <Save size={16} />
          </button>
        </Tip>
      </div>

      <nav className="wb-workspaces" aria-label="Workspaces">
        {WORKSPACES.map((w) => (
          <button
            key={w}
            type="button"
            className={`wb-ws${w === ws ? " is-active" : ""}`}
            aria-current={w === ws ? "page" : undefined}
            data-testid={`ws-${w}`}
            onClick={() => useView.getState().set({ workspace: w })}
          >
            {WORKSPACE_LABEL[w]}
          </button>
        ))}
      </nav>

      <div className="wb-appbar-right">
        <Tip
          title="Find command"
          shortcut="S"
          body="Type a command name, for example “cut rail”, and run it."
        >
          <button
            type="button"
            className="wb-search"
            onClick={() => runCommand("app.search")}
            data-testid="open-search"
          >
            <Search size={14} aria-hidden /> <span>Find command</span> <kbd>S</kbd>
          </button>
        </Tip>
        <Tip
          title={labelOf(COMMANDS["view.theme"]!)}
          shortcut="Shift+T"
          body="Switch between the dark and the light theme."
        >
          <button
            type="button"
            className="wb-iconbtn"
            aria-label="Switch theme"
            onClick={() => runCommand("view.theme")}
            data-testid="theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </Tip>
      </div>
    </header>
  );
}
