"""Build the app as a single claude.ai artifact page (the clickable preview link).

Usage (repo root):  pnpm build:artifact   → apps/web/dist-artifact/

The artifact host wraps the page in its own <html> skeleton, serves only
standard web file types (no .glb) and blocks external stylesheets, so:
  - the Vite build uses relative paths (--base ./) and VITE_MODELS_AS_TEXT=1;
  - every models/*.glb becomes models/*.glb.txt (base64; parts/modelLoader.ts decodes it);
  - simulator.html holds the title, the inlined CSS, the root div and the entry script;
  - files.json maps every other file for the Artifact tool's `files` argument.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys

# Part models (base64 text) are only needed once the Workbench places parts (Phase 2).
INCLUDE_MODELS = False

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, "apps", "web")
OUT = os.path.join(WEB, "dist-artifact")


def main() -> None:
    env = dict(os.environ, VITE_MODELS_AS_TEXT="1", VITE_NO_CLASSIC="1")
    subprocess.run(
        ["npx", "vite", "build", "--base", "./", "--outDir", OUT, "--emptyOutDir"],
        cwd=WEB, env=env, check=True,
    )
    models = os.path.join(OUT, "models")
    if not INCLUDE_MODELS:
        shutil.rmtree(models, ignore_errors=True)  # the Workbench draws no part models yet (Phase 2 adds them)
        os.makedirs(models, exist_ok=True)
    for name in os.listdir(models):
        if name.endswith(".glb"):
            path = os.path.join(models, name)
            with open(path, "rb") as f:
                data = base64.b64encode(f.read())
            with open(path + ".txt", "wb") as f:
                f.write(data)
            os.remove(path)
    html = open(os.path.join(OUT, "index.html"), encoding="utf-8").read()
    css_href = re.search(r'<link rel="stylesheet"[^>]*href="\./([^"]+)"', html).group(1)
    js_src = re.search(r'<script type="module"[^>]*src="\./([^"]+)"', html).group(1)
    css = open(os.path.join(OUT, css_href), encoding="utf-8").read()
    page = (
        "<title>Solar Workbench</title>\n"
        '<meta name="description" content="Solar Workbench: 3D solar PV and electrical installation design (design aid)">\n'
        f"<style>{css}</style>\n"
        '<div id="root"></div>\n'
        f'<script type="module" src="./{js_src}"></script>\n'
    )
    with open(os.path.join(OUT, "simulator.html"), "w", encoding="utf-8") as f:
        f.write(page)
    files = {}
    for root, _, names in os.walk(OUT):
        for n in names:
            rel = os.path.relpath(os.path.join(root, n), OUT).replace(os.sep, "/")
            if rel in ("index.html", "simulator.html", "files.json", "sw.js", "manifest.webmanifest") or rel.endswith(".css"):
                continue
            files[rel] = rel
    with open(os.path.join(OUT, "files.json"), "w", encoding="utf-8") as f:
        json.dump(dict(sorted(files.items())), f, indent=1)
    print(f"{OUT}/simulator.html + {len(files)} files (publish with root={OUT})", file=sys.stderr)


if __name__ == "__main__":
    main()
