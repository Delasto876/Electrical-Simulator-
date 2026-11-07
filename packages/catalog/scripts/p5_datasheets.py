"""Phase 5 catalog additions, applied on top of gen_inverters.py / gen_protection.py output.

Brand inverter numbers found online (datasheets and distributor listings, read through a
web search on 2026-11-07 because the PDFs could not be downloaded from the build machine),
new brand models, HT-series DIN boxes from 4 to 18 way, and DIN devices for the ready-made
boxes (DC breakers, voltage protector, changeover switch, DIN ATS). Every entry stays
`verified: false`. Idempotent: running it twice changes nothing. The generators call
`main()` after writing their files; run it alone with `python3 p5_datasheets.py`.
Run `pnpm prettier --write packages/catalog/src/data` afterwards.
"""
import copy
import json
from pathlib import Path

root = str(Path(__file__).resolve().parents[1] / "src" / "data") + "/"


def load(f):
    return json.load(open(root + f))


def save(f, d):
    with open(root + f, "w") as fh:
        json.dump(d, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def main():
    inverters()
    enclosures()
    din_devices()


SEARCHED = ("Numbers taken from the manufacturer datasheet and distributor listings as summarised by a web search "
            "on 2026-11-07 (the PDF itself could not be downloaded from this build machine). NOT verified: check the "
            "current datasheet before relying on any number.")


def inverters():
    inv = load("inverters.json")
    by = {p["id"]: p for p in inv}

    def upd(i, url, note, dims=None, kg=None, **el):
        p = by[i]
        p["datasheetUrl"] = url
        p["notes"] = SEARCHED + (" " + note if note else "")
        if dims: p["dimensions"] = dict(zip(["lengthMm", "widthMm", "heightMm"], dims))
        if kg is not None: p["weightKg"] = kg
        for k, v in el.items(): p["electrical"][k] = v

    upd("luxpower-sna-5000-wpv",
        "https://cdn.shopify.com/s/files/1/0814/7546/9590/files/Luxpowertek-SNA-datasheet_2713f079-f0eb-4436-ac3b-54d6fcb42f9c.pdf",
        "Listings disagree on the PV voltage ceiling (480 V vs 500 V); 480 V used. Size 330 × 504 × 135 mm, 14 kg.",
        dims=[504, 330, 135], kg=14, maxPvVoltageV=480)
    upd("deye-sun-5k-sg03lp1-eu",
        "https://cdn.shopify.com/s/files/1/0791/4186/3703/files/5Kw_Deye_Datasheet.pdf",
        "Weight 20.5 kg in one listing, 21 kg in another.")
    upd("deye-sun-8k-sg01lp1-us",
        "https://deye.com/ja/product/sun-5-6-7-6-8k-sg01lp1-us/",
        "10.4 kW PV, 26 + 26 A, 190 A charge confirmed by listings; the MPPT window (125–425 V vs 150–425 V) is not.")
    upd("sol-ark-12k-2p-n", "https://solartown.com/content/12K-2P_SpecSheet_2.pdf",
        "Rated MPPT window 175–425 V on the current sheet (an older sheet says 150–425 V); start-up 125 V; 13 kW PV; 185 A battery.",
        mpptMinV=175)
    upd("sol-ark-15k-2p-n",
        "https://practicalpreppers.com/wp-content/uploads/2022/01/SK150-0001_Rev5_15K-Datasheet_EN-18June2025.pdf",
        "Rev 5 sheet: usable PV 19.5 kW, rated MPPT window 175–425 V (MPPT range 150–500 V), 275 A battery.",
        mpptMinV=175)
    upd("srne-hf4850s80-h", "https://cdn.shopify.com/s/files/1/0678/0731/4206/files/SRNE_HF4850S80-H.pdf", "")
    for i in ["deye-sun-12k-sg04lp3-eu", "growatt-spf-5000-es", "growatt-spf-6000t-dvm-mpv", "growatt-min-6000tl-x",
              "growatt-mod-10ktl3-x", "luxpower-lxp-lb-us-12k", "srne-ml4860"]:
        if "Not re-checked" not in by[i].get("notes", ""):
            by[i]["notes"] = by[i].get("notes", "") + " Not re-checked in the 2026-11 datasheet pass."

    def clone(src, i, model, url, note, dims, kg, tags, **el):
        if i in by:
            inv.remove(by[i])
        p = copy.deepcopy(by[src])
        p["id"] = i; p["model"] = model; p["datasheetUrl"] = url
        p["notes"] = SEARCHED + " " + note
        p["dimensions"] = dict(zip(["lengthMm", "widthMm", "heightMm"], dims)); p["weightKg"] = kg
        p.pop("modelUrl", None)  # no Blender model yet: drawn as a procedural box
        p["tags"] = tags
        for k, v in el.items(): p["electrical"][k] = v
        inv.append(p); by[i] = p
        return p

    clone("luxpower-sna-5000-wpv", "luxpower-sna-6000-wpv", "SNA 6000 WPV off-grid, single-phase 230 V",
          "https://masterenergy.eu/wp-content/uploads/2025/01/Datasheet-Luxpower-6Kw-OffGrid-Inverter-SNA6000.pdf",
          "Max PV power is 8 kW, 9 kW or 9.6 kW depending on the listing; 8 kW used. 17 A per MPPT from retailer listings; "
          "short-circuit current not found (22 A assumed, VERIFY). Same chassis as the SNA 5000 WPV assumed.",
          [504, 330, 135], 14, ["Luxpower", "off-grid", "single-phase", "6kW"],
          ratedAcPowerW=6000, surgePowerW=12000, maxPvInputPowerW=8000, maxPvVoltageV=480, mpptMinV=120, mpptMaxV=385,
          startupVoltageV=100,
          mppts=[{"maxStrings": 1, "maxInputCurrentA": 17, "maxShortCircuitCurrentA": 22}] * 2,
          battery={"nominalV": 48, "minV": 40, "maxV": 60, "maxChargeCurrentA": 140, "maxDischargeCurrentA": 140},
          recommendedBatteryFuseA=175)
    clone("deye-sun-5k-sg03lp1-eu", "deye-sun-6k-sg05lp1-eu", "SUN-6K-SG05LP1-EU hybrid, single-phase 230 V",
          "https://deye.com/vi/product/sun-3-6-5-6-7-7-6-8-10k-sg05lp1-eu-am2-p/",
          "12 kW max PV access power, 2 MPPT, IP65 and 24 kg from listings. MPPT window, per-MPPT current and battery "
          "current were not in the search results: values here are from memory (VERIFY).",
          [580, 330, 232], 24, ["Deye", "hybrid", "single-phase", "6kW"],
          ratedAcPowerW=6000, surgePowerW=12000, maxPvInputPowerW=12000, mpptMinV=125, mpptMaxV=425,
          mppts=[{"maxStrings": 2, "maxInputCurrentA": 26, "maxShortCircuitCurrentA": 34}] * 2,
          battery={"nominalV": 48, "minV": 40, "maxV": 60, "maxChargeCurrentA": 135, "maxDischargeCurrentA": 135},
          recommendedBatteryFuseA=175)
    clone("growatt-spf-5000-es", "growatt-spf-6000-es-plus", "SPF 6000 ES Plus off-grid, single-phase 230 V",
          "https://cdn.autosolar.es/pdf/fichas-tecnicas/Growatt_SPF_6000_ES_Plus.pdf",
          "Listings: 2 MPPT, 16 A each, 450 V max (one says 500 V), MPPT 120–430 V (one says 120–450 V), 100 A solar "
          "charge, 80 A AC charge, 460 × 395 × 132 mm, 13.5 kg. PV power and short-circuit current not found (VERIFY).",
          [460, 395, 132], 13.5, ["Growatt", "off-grid", "single-phase", "6kW"],
          ratedAcPowerW=6000, surgePowerW=12000, maxPvInputPowerW=8000, maxPvVoltageV=450, mpptMinV=120, mpptMaxV=430,
          mppts=[{"maxStrings": 1, "maxInputCurrentA": 16, "maxShortCircuitCurrentA": 20}] * 2,
          battery={"nominalV": 48, "minV": 40, "maxV": 60, "maxChargeCurrentA": 100, "maxDischargeCurrentA": 135},
          recommendedBatteryFuseA=175)
    p = by["growatt-spf-6000-es-plus"]
    # second MPPT terminals for the 2-tracker models cloned from a 1-tracker entry
    def add_pv2(p):
        if any(x["id"] == "pv2+" for x in p["ports"]): return
        a = next(x for x in p["ports"] if x["id"] == "pv1+"); b = next(x for x in p["ports"] if x["id"] == "pv1-")
        for src, nid, lab in [(a, "pv2+", "PV2 +"), (b, "pv2-", "PV2 -")]:
            q = copy.deepcopy(src); q["id"] = nid; q["label"] = lab; q["group"] = "mppt2"
            q["position"] = [q["position"][0] + 0.07, q["position"][1], q["position"][2]]
            p["ports"].insert(p["ports"].index(b) + 1 + (1 if nid == "pv2-" else 0), q)
    add_pv2(p)
    clone("srne-hf4850s80-h", "srne-asf4880s180-h", "ASF4880S180-H off-grid, single-phase 230 V",
          "https://cdn.shopify.com/s/files/1/0682/1124/5378/files/SRNE_ASF-series_48V_8-10kW_S_hybrid-solar-charge-inverter_datasheet_1.5.pdf",
          "Datasheet 1.5: 2 MPPT, 5.5 kW + 5.5 kW, 22 A + 22 A, 500 V Voc, MPPT 125–425 V, 180 A MPPT charge, IP20, "
          "620 × 445 × 130 mm, 27 kg (rev 1.1 says 435 mm, 21 kg). Short-circuit current and discharge current not "
          "found (VERIFY).",
          [620, 445, 130], 27, ["SRNE", "off-grid", "single-phase", "8kW"],
          ratedAcPowerW=8000, surgePowerW=16000, maxPvInputPowerW=11000, maxPvVoltageV=500, mpptMinV=125, mpptMaxV=425,
          mppts=[{"maxStrings": 1, "maxInputCurrentA": 22, "maxShortCircuitCurrentA": 27}] * 2,
          battery={"nominalV": 48, "minV": 40, "maxV": 60, "maxChargeCurrentA": 180, "maxDischargeCurrentA": 180},
          recommendedBatteryFuseA=250)
    add_pv2(by["srne-asf4880s180-h"])
    save("inverters.json", inv)


def enclosures():
    enc = load("enclosures.json")
    HT_URL = "https://viox.com/product/ht5"
    HT = [(4, 159, 119, 90, 0.35), (5, 159, 119, 90, 0.35), (8, 155, 201, 90, 0.5), (12, 198, 255, 108, 0.8),
          (15, 198, 309, 108, 0.95), (18, 198, 363, 108, 1.1)]
    tmpl = next(p for p in enc if p["id"] == "generic-enclosure-8m")
    existing = {p["id"] for p in enc}
    for n, hmm, wmm, dmm, kg in HT:
        i = f"ht-enclosure-{n}way"
        if i in existing: continue
        p = copy.deepcopy(tmpl)
        p.pop("modelUrl", None)
        p.update({
            "id": i, "brand": "Generic (HT series)",
            "model": f"HT-{n} plastic DIN box, {n}-way, IP65, smoke-grey door",
            "dimensions": {"lengthMm": hmm, "widthMm": wmm, "heightMm": dmm}, "weightKg": kg,
            "datasheetUrl": HT_URL,
            "notes": ("Sizes from the VIOX HT series table (HT-5P 119 × 159 × 90, HT-8P 201 × 155 × 90, HT-12P 255 × 198 × 108, "
                      "HT-15P 309 × 198 × 108, HT-18P 363 × 198 × 108 mm) found by web search on 2026-11-07. "
                      + ("The 4-way box uses the 5-way shell (4 modules of rail). " if n == 4 else "")
                      + "Many brands sell the same shell; check yours. Not verified."),
            "price": {"amount": round(6 + n * 0.9, 2), "currency": "USD", "unit": "each"},
            "tags": ["enclosure", f"{n} way", f"{n} modules", "plastic", "HT"],
            "enclosure": {"modulesPerRow": n, "rows": 1, "material": "plastic", "ipRating": "IP65", "transparentDoor": True},
        })
        p["ports"][0]["position"] = [-(wmm / 2 - 20) / 1000, 0.02, -(dmm / 2 - 15) / 1000]
        enc.append(p)
    save("enclosures.json", enc)


def din_devices():
    din = load("din-devices.json")
    dby = {p["id"]: p for p in din}
    GEN = "Generic representative placeholder, not manufacturer data. Check the product's datasheet and listing."
    def port(i, t, x, y, d, lab, pol, g):
        return {"id": i, "type": t, "position": [x, y, -0.02], "direction": [0, d, 0], "label": lab, "polarity": pol, "group": g}
    def dev(i, model, mods, prot, ports, price, tags, notes=GEN, url=None):
        if i in dby: return
        p = {"id": i, "category": "din-device", "brand": "Generic", "model": model,
             "dimensions": {"lengthMm": 18 * mods, "widthMm": 70, "heightMm": 90}, "weightKg": round(0.11 * mods, 2),
             "verified": False, "notes": notes, "price": {"amount": price, "currency": "USD", "unit": "each"},
             "tags": tags, "ports": ports, "protection": prot}
        if url: p["datasheetUrl"] = url
        din.append(p); dby[i] = p
    def prot(kind, poles, mods, a, ac, dc, ka, curve=None, pol=False):
        return {"kind": kind, "poles": poles, "modules": mods, "ratedCurrentA": a, "voltageRatingAcV": ac,
                "voltageRatingDcV": dc, "breakingCapacityKa": ka, "curve": curve, "polaritySensitive": pol, "residualMa": None}
    def two_pole(t, a, b):
        return [port("l1", t, -0.009, 0.085, 1, f"line {a}", a, "line"), port("t1", t, -0.009, 0.005, -1, f"load {a}", a, "load"),
                port("l2", t, 0.009, 0.085, 1, f"line {b}", b, "line"), port("t2", t, 0.009, 0.005, -1, f"load {b}", b, "load")]

    dev("generic-mcb-dc-2p-20a", "DC MCB 2P 20 A 550 V DC 6 kA (polarity-sensitive)", 2,
        prot("mcb-dc", 2, 2, 20, None, 550, 6, "C", True), two_pole("dc-terminal", "+", "-"), 9, ["mcb-dc", "20A", "2P"])
    dev("generic-mcb-dc-2p-125a", "DC MCB 2P 125 A 250 V DC 10 kA, battery disconnect", 2,
        prot("mcb-dc", 2, 2, 125, None, 250, 10, "C", True), two_pole("dc-terminal", "+", "-"), 28,
        ["mcb-dc", "125A", "2P", "battery"],
        GEN + " Many 125 A DIN DC breakers are 27 mm per pole (3 modules for 2P): check yours.")
    dev("generic-mcb-ac-2p-32a", "AC MCB 2P 32 A C-curve 6 kA", 2,
        prot("mcb-ac", 2, 2, 32, 400, None, 6, "C"), two_pole("ac-terminal", "L1", "N"), 12, ["mcb-ac", "32A", "2P"])
    dev("generic-voltage-protector-63a", "Over/under-voltage protector 63 A 1P+N 230 V, adjustable, LED display", 2,
        prot("voltage-protector", 2, 2, 63, 230, None, 3), two_pole("ac-terminal", "L1", "N"), 14,
        ["voltage-protector", "63A", "AVR", "over-voltage", "under-voltage"],
        "Representative of the adjustable DIN over/under-voltage relays sold online (typically 230–300 V over, "
        "140–210 V under, 63 A, 35 mm rail; e.g. TOMZN TOVPD1-63). Width in modules not stated by the listings (2 assumed, "
        "VERIFY). Not manufacturer data.", "https://www.rcscomponents.kiev.ua/datasheets/TOVPD1-40-EC.pdf")
    def changeover_ports():
        return [port("s1-l1", "ac-terminal", -0.018, 0.085, 1, "I L1", "L1", "s1"),
                port("s1-n", "ac-terminal", -0.006, 0.085, 1, "I N", "N", "s1"),
                port("s2-l1", "ac-terminal", 0.006, 0.085, 1, "II L1", "L1", "s2"),
                port("s2-n", "ac-terminal", 0.018, 0.085, 1, "II N", "N", "s2"),
                port("load-l1", "ac-terminal", -0.009, 0.005, -1, "load L1", "L1", "load"),
                port("load-n", "ac-terminal", 0.009, 0.005, -1, "load N", "N", "load")]
    dev("generic-changeover-2p-63a", "Manual changeover switch I-0-II 2P 63 A 230 V (manual transfer switch)", 3,
        prot("changeover", 2, 3, 63, 230, None, 6), changeover_ports(), 22,
        ["changeover", "manual transfer switch", "MTS", "63A", "2P"],
        GEN + " Width of 3 modules is typical but not checked (VERIFY).")
    dev("generic-ats-din-2p-63a", "DIN dual-power ATS 2P 63 A 230 V (automatic transfer switch)", 4,
        prot("ats-din", 2, 4, 63, 230, None, 6), changeover_ports(), 38,
        ["ATS", "dual power", "automatic transfer switch", "63A", "2P"],
        GEN + " Width of 4 modules is typical for the cheap DIN dual-power ATS but not checked (VERIFY).")
    save("din-devices.json", din)


if __name__ == "__main__":
    main()
