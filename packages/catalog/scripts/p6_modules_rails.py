"""Phase 6 catalog additions: rail stock in feet and the popular large PV modules.

Rails: every profile is sold in 14, 16, 18, 20 and 24 ft sticks (the lengths the user
buys). Modules: 595/600 W (LONGi Hi-MO 6, LR5-72HTH), 620 W (Jinko Tiger Neo
JKM620N-78HL4-BDV), 715/720 W (Trina Vertex N TSM-NEG21C.20) with the STC values found by
web search on 2026-11-07 (datasheets / distributor tables, not downloaded: VERIFY), and
generic 615, 625, 665 and 700 W classes estimated from the neighbouring rows of those
families (flagged in their notes). 450 and 550 W already exist. Everything stays
`verified: false`. Idempotent; run `python3 p6_modules_rails.py`, then prettier.
"""
import copy
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "src" / "data"
FT_MM = 304.8
STOCK_FT = [14, 16, 18, 20, 24]

SEARCHED = (
    "STC values from the manufacturer datasheet / distributor tables found by web search on 2026-11-07 "
    "(the PDF itself was not downloaded). NOT verified: check the datasheet of the module you install."
)


def load(name):
    return json.loads((DATA / name).read_text())


def save(name, data):
    (DATA / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def rails():
    rs = load("rails.json")
    stock = [round(f * FT_MM) for f in STOCK_FT]
    for r in rs:
        m = r["mounting"]
        m["stockLengthsMm"] = stock
        r["dimensions"]["lengthMm"] = max(stock)
        r["weightKg"] = round(m["weightKgPerM"] * max(stock) / 1000, 2)
        name = r["model"].split(" (")[0]
        r["model"] = f"{name} (stock 14 / 16 / 18 / 20 / 24 ft)"
    save("rails.json", rs)


def module(tmpl, id_, brand, model, w, l, t, kg, el, tags, note, url=None, price=None):
    p = copy.deepcopy(tmpl)
    p.update({"id": id_, "brand": brand, "model": model, "weightKg": kg, "tags": tags, "notes": note})
    p["dimensions"] = {"lengthMm": l, "widthMm": w, "heightMm": t}
    if url:
        p["datasheetUrl"] = url
    else:
        p.pop("datasheetUrl", None)
    p["price"] = {"amount": price or round(el["pmaxW"] * 0.3), "currency": "USD", "unit": "each"}
    p["electrical"].update(el)
    p["mechanical"]["frameThicknessMm"] = t
    p["mechanical"]["clampingZones"] = [{"edge": "long", "fromMm": round(l * 0.12), "toMm": round(l * 0.3)}]
    half_w = w / 2000
    for q in p["ports"]:
        sx = 1 if q["position"][0] > 0 else -1
        if q["id"] in ("pos", "neg"):
            q["position"] = [round(sx * (half_w + 0.02), 3), -0.03, round(l * 0.39 / 1000, 3)]
        elif q["id"] == "frame-gnd":
            q["position"] = [round(half_w, 3), 0, round(l * 0.25 / 1000, 3)]
    return p


def modules():
    ms = load("pv-modules.json")
    tmpl = next(p for p in ms if p["id"] == "generic-pv-610w-132hc-bifacial")
    topcon = {"tempCoeffPmaxPctPerC": -0.29, "tempCoeffVocPctPerC": -0.25, "tempCoeffIscPctPerC": 0.045,
              "noctC": 43, "cellType": "topcon", "halfCut": True, "bifacial": True, "bifaciality": 0.8,
              "firstYearDegradationPct": 1.0, "degradationPctPerYear": 0.4, "maxSystemVoltageV": 1500,
              "bypassDiodes": 3}
    longi = dict(topcon, cellType="ibc", bifacial=False, bifaciality=0, tempCoeffPmaxPctPerC=-0.29,
                 tempCoeffVocPctPerC=-0.23, tempCoeffIscPctPerC=0.05, cellCount=144, cellsInSeries=72,
                 maxSeriesFuseA=25)
    jinko = dict(topcon, cellCount=156, cellsInSeries=78, maxSeriesFuseA=30)
    trina_n = dict(topcon, tempCoeffVocPctPerC=-0.24, tempCoeffIscPctPerC=0.04, cellCount=132,
                   cellsInSeries=66, maxSeriesFuseA=35)
    trina_p = dict(trina_n, cellType="mono-perc", tempCoeffPmaxPctPerC=-0.34, tempCoeffVocPctPerC=-0.25,
                   bifaciality=0.7, firstYearDegradationPct=2.0, degradationPctPerYear=0.45)
    coeff = " Temperature coefficients, fuse rating and bifaciality are typical for the cell type (VERIFY)."
    est = (" Generic class: Vmp/Voc taken from the neighbouring rows of the {fam} family, Imp = P / Vmp and "
           "Isc scaled with it. ESTIMATED, not a product: use your module's datasheet.")
    longi_url = ("https://gycxsolar.com/wp-content/uploads/2023/12/"
                 "L_Gi_LE_PM_T_PMD_059_F133_LR_5_72_HTH_590_600_M_V1_35_35_and_15_Frame_Scientist_V19_42b14719df.pdf")
    trina_url = "https://www.sunwaypv.com/product/trina-vertex-n-solar-panel-675w-700w-tsm-neg21c-20"
    new = [
        module(tmpl, "longi-lr5-72hth-595m", "LONGi", "Hi-MO 6 LR5-72HTH-595M 144 half-cell HPBC", 1134, 2278, 35, 27.5,
               dict(longi, pmaxW=595, vocV=52.66, iscA=14.40, vmpV=44.51, impA=13.37),
               ["595W", "144-cell", "half-cut", "LONGi"], SEARCHED + coeff, longi_url),
        module(tmpl, "longi-lr5-72hth-600m", "LONGi", "Hi-MO 6 LR5-72HTH-600M 144 half-cell HPBC", 1134, 2278, 35, 27.5,
               dict(longi, pmaxW=600, vocV=52.81, iscA=14.46, vmpV=44.66, impA=13.44),
               ["600W", "144-cell", "half-cut", "LONGi"], SEARCHED + coeff, longi_url),
        module(tmpl, "generic-pv-615w-156hc-topcon", "Generic", "PV-615 156-cell half-cut TOPCon bifacial (182 mm)",
               1134, 2465, 30, 34.0, dict(jinko, pmaxW=615, vocV=55.4, vmpV=45.8, impA=13.43, iscA=14.12),
               ["615W", "156-cell", "half-cut", "TOPCon", "bifacial"], est.format(fam="Jinko Tiger Neo 78HL4") + coeff),
        module(tmpl, "jinko-jkm620n-78hl4-bdv", "Jinko", "Tiger Neo JKM620N-78HL4-BDV 156 half-cell TOPCon bifacial",
               1134, 2465, 30, 34.0, dict(jinko, pmaxW=620, vocV=55.58, iscA=14.19, vmpV=45.93, impA=13.50),
               ["620W", "156-cell", "half-cut", "TOPCon", "bifacial", "Jinko"],
               SEARCHED + " Column order of the table read as Vmp, Imp, Voc, Isc." + coeff,
               "https://www.esol.cl/files/JKM625N.pdf"),
        module(tmpl, "generic-pv-625w-156hc-topcon", "Generic", "PV-625 156-cell half-cut TOPCon bifacial (182 mm)",
               1134, 2465, 30, 34.0, dict(jinko, pmaxW=625, vocV=55.7, vmpV=46.1, impA=13.56, iscA=14.25),
               ["625W", "156-cell", "half-cut", "TOPCon", "bifacial"], est.format(fam="Jinko Tiger Neo 78HL4") + coeff),
        module(tmpl, "generic-pv-665w-132hc-bifacial", "Generic", "PV-665 132-cell half-cut PERC bifacial (210 mm)",
               1303, 2384, 35, 38.3, dict(trina_p, pmaxW=665, vocV=46.1, vmpV=38.3, impA=17.36, iscA=18.45),
               ["665W", "132-cell", "half-cut", "bifacial", "210mm"],
               est.format(fam="Trina Vertex TSM-DEG21C.20 (650/655 W rows)") + coeff),
        module(tmpl, "generic-pv-700w-132hc-topcon", "Generic", "PV-700 132-cell half-cut TOPCon bifacial (210 mm)",
               1303, 2384, 33, 38.3, dict(trina_n, pmaxW=700, vocV=48.7, vmpV=40.8, impA=17.16, iscA=18.2),
               ["700W", "132-cell", "half-cut", "TOPCon", "bifacial", "210mm"],
               est.format(fam="Trina Vertex N TSM-NEG21C.20") + coeff),
        module(tmpl, "trina-tsm-715neg21c20", "Trina", "Vertex N TSM-715NEG21C.20 132 half-cell TOPCon bifacial",
               1303, 2384, 33, 38.3, dict(trina_n, pmaxW=715, vocV=49.2, iscA=18.44, vmpV=41.1, impA=17.4),
               ["715W", "132-cell", "half-cut", "TOPCon", "bifacial", "Trina", "210mm"], SEARCHED + coeff, trina_url),
        module(tmpl, "trina-tsm-720neg21c20", "Trina", "Vertex N TSM-720NEG21C.20 132 half-cell TOPCon bifacial",
               1303, 2384, 33, 38.3, dict(trina_n, pmaxW=720, vocV=49.4, iscA=18.49, vmpV=41.3, impA=17.44),
               ["720W", "132-cell", "half-cut", "TOPCon", "bifacial", "Trina", "210mm"], SEARCHED + coeff, trina_url),
    ]
    ids = {p["id"] for p in new}
    ms = [p for p in ms if p["id"] not in ids] + new
    ms.sort(key=lambda p: (p["electrical"]["pmaxW"], p["id"]))
    save("pv-modules.json", ms)


def clamps():
    """33 mm frames (Trina Vertex N) need their own end and mid clamps."""
    cs = load("module-clamps.json")
    have = {c["id"] for c in cs}
    for kind in ("end", "mid"):
        src = next(c for c in cs if c["id"] == f"generic-{kind}-clamp-35")
        id_ = f"generic-{kind}-clamp-33"
        if id_ in have:
            continue
        c = copy.deepcopy(src)
        c["id"] = id_
        c["model"] = c["model"].replace("35", "33")
        c["tags"] = [t.replace("35", "33") for t in c["tags"]]
        c["mounting"]["frameThicknessMm"] = 33
        c.pop("modelUrl", None)
        cs.insert(cs.index(src), c)
    save("module-clamps.json", cs)


def main():
    rails()
    modules()
    clamps()


if __name__ == "__main__":
    main()
