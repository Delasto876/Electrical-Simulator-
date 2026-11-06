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
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, "apps", "web")
OUT = os.path.join(WEB, "dist-artifact")


def main() -> None:
    env = dict(os.environ, VITE_MODELS_AS_TEXT="1")
    subprocess.run(
        ["npx", "vite", "build", "--base", "./", "--outDir", OUT, "--emptyOutDir"],
        cwd=WEB, env=env, check=True,
    )
    models = os.path.join(OUT, "models")
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
        "<title>Solar Design Simulator</title>\n"
        '<meta name="description" content="3D solar PV and electrical design simulator by Lumix Technologies (design aid)">\n'
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
