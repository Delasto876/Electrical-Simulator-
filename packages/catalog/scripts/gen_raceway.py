#!/usr/bin/env python3
"""Generate the Phase 5 raceway catalog: PVC conduit (Schedule 40 and 80),
flexible conduit (FMC, LFMC, LFNC-B) in every trade size, their fittings, and
PVC trunking / steel wireway in inch sizes.

Edit the tables below and run:  python3 packages/catalog/scripts/gen_raceway.py

Internal diameters: NEC Chapter 9 Table 4 (recalled, VERIFY). The internal
area is computed as pi/4 * ID^2, as the table does. Outside diameters of PVC
are the IPS pipe sizes; flexible conduit ODs are typical catalog values
(VERIFY). Prices are placeholders.
"""
import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "src" / "data"
NOTE = "Generic representative placeholder, not manufacturer data. Check the product's listing and datasheet."
IN = 25.4

# trade size label, nominal inches
SIZES = {
    "3/8": 0.375, "1/2": 0.5, "3/4": 0.75, "1": 1, "1-1/4": 1.25, "1-1/2": 1.5, "2": 2,
    "2-1/2": 2.5, "3": 3, "3-1/2": 3.5, "4": 4, "5": 5, "6": 6,
}
PVC_OD = {"1/2": 0.840, "3/4": 1.050, "1": 1.315, "1-1/4": 1.660, "1-1/2": 1.900, "2": 2.375, "2-1/2": 2.875,
          "3": 3.500, "3-1/2": 4.000, "4": 4.500, "5": 5.563, "6": 6.625}
FLEX_OD = {"3/8": 0.70, **{k: v for k, v in PVC_OD.items() if k not in ("5", "6")}}

# Chapter 9 Table 4 internal diameters [in]  // VERIFY
ID = {
    "pvc-sch40": {"1/2": 0.602, "3/4": 0.804, "1": 1.029, "1-1/4": 1.360, "1-1/2": 1.590, "2": 2.047, "2-1/2": 2.445,
                  "3": 3.042, "3-1/2": 3.521, "4": 3.998, "5": 5.016, "6": 6.031},
    "pvc-sch80": {"1/2": 0.526, "3/4": 0.722, "1": 0.936, "1-1/4": 1.255, "1-1/2": 1.476, "2": 1.913, "2-1/2": 2.290,
                  "3": 2.864, "3-1/2": 3.326, "4": 3.786, "5": 4.768, "6": 5.709},
    "fmc": {"3/8": 0.384, "1/2": 0.635, "3/4": 0.824, "1": 1.020, "1-1/4": 1.275, "1-1/2": 1.538, "2": 2.040,
            "2-1/2": 2.500, "3": 3.000, "3-1/2": 3.500, "4": 4.000},
    "lfmc": {"3/8": 0.494, "1/2": 0.632, "3/4": 0.830, "1": 1.054, "1-1/4": 1.395, "1-1/2": 1.588, "2": 2.033,
             "2-1/2": 2.493, "3": 3.085, "3-1/2": 3.520, "4": 4.020},
    "lfnc-b": {"3/8": 0.494, "1/2": 0.632, "3/4": 0.830, "1": 1.054, "1-1/4": 1.395, "1-1/2": 1.588, "2": 2.033},
}

# kind: (label, family, stick ft or None, flexible, metallic, wet, sun, burial, damage, price per stick/ft at 1 in)
KINDS = {
    "pvc-sch40": ("PVC Schedule 40 conduit", "pvc", 10, False, False, True, True, True, False, 9.0),
    "pvc-sch80": ("PVC Schedule 80 conduit", "pvc", 10, False, False, True, True, True, True, 14.0),
    "fmc": ("Flexible metal conduit (FMC)", "fmc", None, True, True, False, True, False, False, 1.1),
    "lfmc": ("Liquid-tight flexible metal conduit (LFMC)", "lfmc", None, True, True, True, True, False, False, 2.0),
    "lfnc-b": ("Liquid-tight flexible nonmetallic conduit (LFNC-B)", "lfnc", None, True, False, True, True, False, False, 1.6),
}

FITTINGS = {
    # family: [(kind, label, price at 1 in)]
    "pvc": [("elbow-90", "90° elbow", 4.0), ("elbow-45", "45° elbow", 3.5), ("coupling", "coupling", 0.8),
            ("terminal-adapter", "terminal adapter", 0.9), ("lb", "LB conduit body", 9.0),
            ("junction-box", "pull / junction box", 14.0), ("strap", "strap", 0.3),
            ("expansion", "expansion coupling (6 in travel)", 22.0)],
    "fmc": [("connector", "connector", 1.5), ("junction-box", "pull / junction box", 9.0), ("strap", "strap", 0.3)],
    "lfmc": [("connector", "liquid-tight connector", 4.0), ("junction-box", "pull / junction box (wet)", 16.0),
             ("strap", "strap", 0.3)],
    "lfnc": [("connector", "liquid-tight connector", 3.0), ("junction-box", "pull / junction box (wet)", 14.0),
             ("strap", "strap", 0.3)],
}

# Trunking: (kind, family, size label, w, h, wall in, stock ft, metallic, wet, sun, price per stock length)
TRUNKING = [
    ("pvc-trunking", "pvc-trunking", "3/4 × 1/2 in", 0.75, 0.5, 0.06, 6, False, False, False, 4.0),
    ("pvc-trunking", "pvc-trunking", "1 × 1 in", 1, 1, 0.07, 6, False, False, False, 6.0),
    ("pvc-trunking", "pvc-trunking", "1-1/2 × 1 in", 1.5, 1, 0.07, 6, False, False, False, 8.0),
    ("pvc-trunking", "pvc-trunking", "2 × 1 in", 2, 1, 0.08, 6, False, False, False, 10.0),
    ("pvc-trunking", "pvc-trunking", "2 × 2 in", 2, 2, 0.08, 6, False, False, False, 14.0),
    ("pvc-trunking", "pvc-trunking", "3 × 2 in", 3, 2, 0.09, 6, False, False, False, 18.0),
    ("pvc-trunking", "pvc-trunking", "4 × 2 in", 4, 2, 0.1, 6, False, False, False, 22.0),
    ("pvc-trunking", "pvc-trunking", "4 × 3 in", 4, 3, 0.1, 6, False, False, False, 26.0),
    ("pvc-trunking", "pvc-trunking", "4 × 4 in", 4, 4, 0.1, 6, False, False, False, 30.0),
    ("steel-wireway", "steel-wireway", "2-1/2 × 2-1/2 in", 2.5, 2.5, 0.06, 10, True, True, True, 60.0),
    ("steel-wireway", "steel-wireway", "4 × 4 in", 4, 4, 0.06, 10, True, True, True, 85.0),
    ("steel-wireway", "steel-wireway", "6 × 6 in", 6, 6, 0.07, 10, True, True, True, 130.0),
    ("steel-wireway", "steel-wireway", "8 × 8 in", 8, 8, 0.08, 10, True, True, True, 190.0),
]


def zero(o):
    if isinstance(o, float) and o == 0:
        return 0
    if isinstance(o, list):
        return [zero(v) for v in o]
    if isinstance(o, dict):
        return {k: zero(v) for k, v in o.items()}
    return o


def write(name, entries):
    (DATA / name).write_text(json.dumps(zero(entries), indent=2) + "\n")
    print(f"wrote {len(entries)} → {name}")


def slug(size):
    return size.replace("/", "").replace("-", "-").replace(" ", "")


def size_id(size):
    # "1-1/4" → "1-1-4in", "3/8" → "3-8in"
    return size.replace("/", "-") + "in"


def base(id_, category, model, dims_mm, kg, price, unit, tags):
    l, w, h = dims_mm
    return {"id": id_, "category": category, "brand": "Generic", "model": model,
            "dimensions": {"lengthMm": round(l, 1), "widthMm": round(w, 1), "heightMm": round(h, 1)},
            "weightKg": round(kg, 3), "verified": False, "notes": NOTE,
            "price": {"amount": round(price, 2), "currency": "USD", "unit": unit}, "tags": tags, "ports": []}


def scale_price(p1, size_in):
    return p1 * max(0.4, size_in) ** 1.35


conduits = []
for kind, ids in ID.items():
    label, fam, stick, flexible, metallic, wet, sun, burial, damage, p1 = KINDS[kind]
    for size, idi in ids.items():
        nom = SIZES[size]
        od = (PVC_OD if kind.startswith("pvc") else FLEX_OD)[size]
        area = round(math.pi / 4 * idi * idi, 3)
        length_mm = (stick or 1) * 12 * IN if stick else 304.8
        kg_per_ft = (0.15 if kind.startswith("pvc") else 0.12) * (od ** 1.6)
        e = base(f"{kind}-{size_id(size)}", "conduit", f"{size} in {label}", (length_mm, od * IN, od * IN),
                 kg_per_ft * (stick or 1), scale_price(p1, nom), "each" if stick else "ft",
                 ["conduit", kind, fam, size])
        e["conduit"] = {"kind": kind, "family": fam, "tradeSize": size, "tradeSizeIn": nom,
                        "internalDiameterIn": idi, "outsideDiameterIn": od, "internalAreaIn2": area,
                        "stickLengthFt": stick, "flexible": flexible, "metallic": metallic,
                        "wetLocation": wet, "sunlightResistant": sun, "directBurial": burial, "physicalDamage": damage}
        conduits.append(e)

fittings = []
family_sizes = {"pvc": ID["pvc-sch40"], "fmc": ID["fmc"], "lfmc": ID["lfmc"], "lfnc": ID["lfnc-b"]}
for fam, kinds in FITTINGS.items():
    for size in family_sizes[fam]:
        nom = SIZES[size]
        od = (PVC_OD if fam == "pvc" else FLEX_OD)[size]
        for kind, label, p1 in kinds:
            e = base(f"{fam}-{kind}-{size_id(size)}", "conduit-fitting", f"{size} in {fam.upper()} {label}",
                     (od * IN * 2, od * IN * 1.3, od * IN * 1.3), 0.05 * od ** 2, scale_price(p1, nom), "each",
                     ["conduit-fitting", fam, kind, size])
            e["fitting"] = {"kind": kind, "family": fam, "tradeSize": size}
            if kind == "expansion":
                e["fitting"]["strokeIn"] = 6
            fittings.append(e)

trunking = []
for kind, fam, size, w, h, wall, stock, metallic, wet, sun, price in TRUNKING:
    tid = f"{kind}-{w:g}x{h:g}in".replace(".", "-")
    label = "PVC trunking (with cover)" if kind == "pvc-trunking" else "Steel wireway, NEMA 3R (hinged cover)"
    e = base(tid, "trunking", f"{size} {label}", (stock * 12 * IN, w * IN, h * IN),
             (0.25 if not metallic else 1.6) * w * h * stock / 4, price, "each", ["trunking", kind, size])
    e["trunking"] = {"kind": kind, "family": fam, "size": size, "widthIn": w, "heightIn": h,
                     "internalWidthIn": round(w - 2 * wall, 3), "internalHeightIn": round(h - 2 * wall, 3),
                     "stockLengthFt": stock, "metallic": metallic, "wetLocation": wet, "sunlightResistant": sun,
                     "directBurial": False, "physicalDamage": metallic}
    trunking.append(e)
    for fk, fl, fp in [("end-cap", "end cap", 0.08), ("coupling", "joiner", 0.1), ("strap", "fixing clip", 0.03)]:
        f = base(f"{tid}-{fk}", "conduit-fitting", f"{size} {fam.replace('-', ' ')} {fl}", (w * IN, w * IN, h * IN),
                 0.05, price * fp, "each", ["conduit-fitting", fam, fk])
        f["fitting"] = {"kind": fk, "family": fam, "tradeSize": size}
        fittings.append(f)

write("conduits.json", conduits)
write("conduit-fittings.json", fittings)
write("trunking.json", trunking)
