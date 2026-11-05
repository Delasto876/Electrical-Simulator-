#!/usr/bin/env python3
"""Generate packages/catalog/src/data/inverters.json.

Edit the INVERTERS table below and re-run:  python3 packages/catalog/scripts/gen_inverters.py
Ports are laid out automatically on the bottom face (MC4 pairs per MPPT input,
battery terminals, AC terminals, PE) so every unit follows the same convention:
free-part frame, origin at the bottom centre, +y up, −z = front.

IMPORTANT: model names are real products; the numbers were entered from
memory of the manufacturers' public datasheets and are NOT verified. Every
entry is verified:false and listed in VERIFY.md. Check the current datasheet.
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "src" / "data" / "inverters.json"
NOTE_REAL = ("Real model name. Specifications entered from memory of the manufacturer's public datasheet and NOT "
             "verified. Check the current datasheet before relying on any number.")
NOTE_GENERIC = "Generic representative placeholder, not manufacturer data."

# id, brand, model, kind, acW, surgeW, pvMaxW, maxPvV, (mpptMin, mpptMax), startV,
# mppts [(strings, maxInA, maxIscA)], battery (minV, maxV, chargeA, dischargeA) | None,
# peakEff, standbyW, ac (V, LN, Hz, system) | None, dims (height, width, depth mm), kg, price USD
INVERTERS = [
    ("generic-hybrid-6k-48v-230v", "Generic", "HY-6000 hybrid, 48 V battery, 230 V 50 Hz", "hybrid", 6000, 12000, 7800, 500, (120, 450), 150,
     [(1, 18, 22), (1, 18, 22)], (40, 60, 120, 135), 0.96, 50, (230, None, 50, "single-phase"), (556, 435, 130), 20, 1100),
    # ---------------- Deye
    ("deye-sun-5k-sg03lp1-eu", "Deye", "SUN-5K-SG03LP1-EU hybrid, single-phase 230 V", "hybrid", 5000, 10000, 6500, 500, (125, 425), 125,
     [(1, 13, 17), (1, 13, 17)], (40, 60, 120, 120), 0.976, 50, (230, None, 50, "single-phase"), (580, 330, 232), 20.5, 1100),
    ("deye-sun-8k-sg01lp1-us", "Deye", "SUN-8K-SG01LP1-US hybrid, split-phase 120/240 V", "hybrid", 8000, 16000, 10400, 500, (125, 425), 150,
     [(2, 26, 34), (2, 26, 34)], (40, 60, 190, 190), 0.976, 60, (240, 120, 60, "split-phase"), (705, 420, 280), 33, 2600),
    ("deye-sun-12k-sg04lp3-eu", "Deye", "SUN-12K-SG04LP3-EU hybrid, three-phase 230/400 V", "hybrid", 12000, 24000, 15600, 800, (200, 650), 160,
     [(2, 26, 34), (1, 13, 17)], (40, 60, 240, 240), 0.976, 50, (400, 230, 50, "three-phase"), (702, 422, 281), 33.6, 3200),
    # ---------------- Growatt
    ("growatt-spf-5000-es", "Growatt", "SPF 5000 ES off-grid, single-phase 230 V", "off-grid", 5000, 10000, 6000, 450, (120, 430), 150,
     [(1, 22, 27)], (40, 60, 100, 116), 0.93, 50, (230, None, 50, "single-phase"), (455, 330, 130), 11.5, 700),
    ("growatt-spf-6000t-dvm-mpv", "Growatt", "SPF 6000T DVM-MPV off-grid, split-phase 120/240 V", "off-grid", 6000, 18000, 8000, 250, (64, 230), 70,
     [(1, 27, 32), (1, 27, 32)], (40, 60, 120, 140), 0.93, 60, (240, 120, 60, "split-phase"), (520, 370, 145), 16, 1300),
    ("growatt-min-6000tl-x", "Growatt", "MIN 6000TL-X grid-tie, single-phase 230 V", "grid-tie", 6000, 0, 9000, 550, (80, 550), 100,
     [(1, 13.5, 16.9), (1, 13.5, 16.9)], None, 0.984, 1, (230, None, 50, "single-phase"), (375, 425, 150), 10.8, 900),
    ("growatt-mod-10ktl3-x", "Growatt", "MOD 10KTL3-X grid-tie, three-phase 400 V", "grid-tie", 10000, 0, 15000, 1100, (140, 1000), 160,
     [(1, 13, 16), (1, 13, 16)], None, 0.986, 1, (400, 230, 50, "three-phase"), (480, 425, 200), 14, 1300),
    # ---------------- Luxpower
    ("luxpower-sna-5000-wpv", "Luxpower", "SNA 5000 WPV off-grid, single-phase 230 V", "off-grid", 5000, 10000, 6500, 500, (120, 385), 140,
     [(1, 18, 22), (1, 18, 22)], (40, 60, 100, 110), 0.935, 40, (230, None, 50, "single-phase"), (480, 330, 130), 13, 750),
    ("luxpower-lxp-lb-us-12k", "Luxpower", "LXP-LB-US 12K hybrid, split-phase 120/240 V", "hybrid", 12000, 18000, 18000, 600, (100, 480), 140,
     [(2, 25, 31), (1, 15, 19), (1, 15, 19)], (40, 60, 250, 250), 0.965, 60, (240, 120, 60, "split-phase"), (650, 500, 230), 37, 3500),
    # ---------------- SRNE
    ("srne-hf4850s80-h", "SRNE", "HF4850S80-H off-grid, single-phase 230 V", "off-grid", 5000, 10000, 5500, 500, (120, 450), 150,
     [(1, 22, 27)], (40, 60, 80, 110), 0.93, 45, (230, None, 50, "single-phase"), (420, 280, 110), 9, 550),
    ("srne-ml4860", "SRNE", "ML4860 MPPT charge controller 60 A (12/24/36/48 V)", "mppt-controller", 0, 0, 3200, 150, (60, 115), 60,
     [(1, 50, 60)], (40, 60, 60, 60), 0.98, 2, None, (290, 220, 110), 3.5, 180),
    # ---------------- Sol-Ark
    ("sol-ark-12k-2p-n", "Sol-Ark", "12K-2P-N hybrid, split-phase 120/240 V", "hybrid", 9000, 16000, 13000, 500, (150, 425), 125,
     [(2, 26, 37.5), (2, 26, 37.5)], (40, 60, 185, 185), 0.965, 60, (240, 120, 60, "split-phase"), (775, 432, 267), 34, 5500),
    ("sol-ark-15k-2p-n", "Sol-Ark", "15K-2P-N hybrid, split-phase 120/240 V", "hybrid", 12000, 20000, 19500, 500, (125, 425), 125,
     [(2, 36, 45), (1, 24, 30), (1, 24, 30)], (40, 60, 275, 275), 0.965, 60, (240, 120, 60, "split-phase"), (813, 457, 267), 39, 7500),
]


def ports(mppts, battery, ac, width_m, depth_m, has_ac_in):
    out = []
    n_pv = sum(s for s, _, _ in mppts)
    x = -width_m / 2 + 0.05
    step = min(0.035, (width_m * 0.45) / max(1, n_pv * 2))
    y, z = 0.0, 0.0
    for i, (strings, _, _) in enumerate(mppts, start=1):
        for k in range(strings):
            suffix = "" if strings == 1 else "abcd"[k]
            # Module + leads are male (user convention, D-013), so the inverter PV+ input is female.
            for pol, gender in (("+", "female"), ("-", "male")):
                out.append({"id": f"pv{i}{suffix}{pol}", "type": "mc4", "polarity": pol, "gender": gender,
                            "connector": f"generic-mc4-{gender}", "group": f"mppt{i}",
                            "position": [round(x, 3), y, z], "direction": [0, -1, 0],
                            "label": f"PV{i}{suffix.upper()} {pol}"})
                x += step
    x = max(x + 0.02, -0.02)
    if battery:
        for pol in "+-":
            out.append({"id": f"bat{pol}", "type": "battery-terminal", "polarity": pol, "group": "bat",
                        "position": [round(x, 3), y, z], "direction": [0, -1, 0], "label": f"BAT {pol}"})
            x += 0.04
    if ac:
        _, ln, _, system = ac
        lines = {"single-phase": ["L1", "N"], "split-phase": ["L1", "L2", "N"], "three-phase": ["L1", "L2", "L3", "N"]}[system]
        # Hybrid / off-grid units have a grid (or generator) input and a backed-up load output;
        # grid-tie units have one AC connection.
        groups = [("ac-in", "AC IN"), ("ac-out", "AC OUT")] if has_ac_in else [("ac", "AC")]
        for group, glabel in groups:
            for pol in lines:
                out.append({"id": f"{group}-{pol.lower()}", "type": "ac-terminal", "polarity": pol, "group": group,
                            "position": [round(min(x, width_m / 2 - 0.06), 3), y, z], "direction": [0, -1, 0], "label": f"{glabel} {pol}"})
                x += 0.018
    out.append({"id": "pe", "type": "ground-point", "polarity": "PE", "group": "pe",
                "position": [round(width_m / 2 - 0.03, 3), y, z], "direction": [0, -1, 0], "label": "PE"})
    return out


entries = []
for (id_, brand, model, kind, acw, surge, pvw, vmax, (vmin, vmppmax), vstart, mppts, battery, eff, standby, ac,
     (h, w, d), kg, price) in INVERTERS:
    e = {
        "id": id_, "category": "inverter", "brand": brand, "model": model,
        "dimensions": {"lengthMm": h, "widthMm": w, "heightMm": d}, "weightKg": kg, "verified": False,
        "notes": NOTE_GENERIC if brand == "Generic" else NOTE_REAL,
        "price": {"amount": price, "currency": "USD", "unit": "each"},
        "modelUrl": f"{id_}.glb",
        "tags": [brand, kind, (ac[3] if ac else "dc-only"), f"{acw / 1000:g}kW" if acw else "controller"],
        "ports": ports(mppts, battery, ac, w / 1000, d / 1000, kind in ("hybrid", "off-grid")),
        "electrical": {
            "kind": kind, "ratedAcPowerW": acw, "surgePowerW": surge, "surgeDurationS": 5 if surge else 0,
            "maxPvInputPowerW": pvw, "maxPvVoltageV": vmax, "mpptMinV": vmin, "mpptMaxV": vmppmax, "startupVoltageV": vstart,
            "mppts": [{"maxStrings": s, "maxInputCurrentA": a, "maxShortCircuitCurrentA": isc} for s, a, isc in mppts],
            "efficiencyCurve": [
                {"loadFraction": 0.05, "efficiency": round(eff - 0.08, 3)},
                {"loadFraction": 0.1, "efficiency": round(eff - 0.03, 3)},
                {"loadFraction": 0.3, "efficiency": round(eff - 0.005, 3)},
                {"loadFraction": 0.5, "efficiency": eff},
                {"loadFraction": 1.0, "efficiency": round(eff - 0.01, 3)},
            ],
            "standbyW": standby,
            "transferSwitch": kind in ("hybrid", "off-grid"),
            # Most string, hybrid and grid-tie inverters have a PV DC switch; off-grid
            # chargers and stand-alone controllers usually do not. // VERIFY per model
            "integratedDcDisconnect": kind in ("hybrid", "grid-tie"),
            "overloadCurve": [{"loadFraction": 1.1, "seconds": 60}, {"loadFraction": 1.5, "seconds": 10}] if surge else [],
        },
    }
    if battery:
        bmin, bmax, chg, dis = battery
        e["electrical"]["battery"] = {"nominalV": 48, "minV": bmin, "maxV": bmax, "maxChargeCurrentA": chg, "maxDischargeCurrentA": dis}
        e["electrical"]["recommendedBatteryFuseA"] = int(round(dis * 1.25 / 25.0) * 25)
    if ac:
        v, ln, hz, system = ac
        e["electrical"]["acOutput"] = {"voltageV": v, "frequencyHz": hz, "system": system, **({"lineToNeutralV": ln} if ln else {})}
    entries.append(e)

def no_negative_zero(o):
    """JSON has no -0 in JavaScript's eyes but Python writes -0.0; normalise to 0."""
    if isinstance(o, float) and o == 0:
        return 0
    if isinstance(o, list):
        return [no_negative_zero(v) for v in o]
    if isinstance(o, dict):
        return {k: no_negative_zero(v) for k, v in o.items()}
    return o


OUT.write_text(json.dumps(no_negative_zero(entries), indent=2) + "\n")
print(f"wrote {len(entries)} inverters to {OUT}")
