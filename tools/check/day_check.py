#!/usr/bin/env python3
"""Independent spreadsheet check of a one-day simulation (Phase 6 done criterion).

Writes docs/verification/day-check/day-check.xlsx in which EVERY result is an
Excel formula written from the published methods, not from the app's code:
  - sun position: NOAA Solar Calculator spreadsheet formulas
  - extraterrestrial irradiance, Hay-Davies plane-of-array, ASHRAE IAM
  - Faiman cell temperature, linear PV model (Pmax temperature coefficient)
  - ageing, DC wiring/connector I^2R, availability
  - hybrid inverter dispatch and battery state of charge (rules in
    packages/engine/src/sim/dispatch.ts and battery.ts doc comments)
LibreOffice Calc then recalculates the workbook headless and the computed
values are written to expected.csv, which the app's test compares with.

  python3 tools/check/day_check.py        (needs openpyxl and LibreOffice)
"""
import csv
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.workbook.defined_name import DefinedName

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "verification" / "day-check"
FIXTURE = ROOT / "apps" / "web" / "src" / "weather" / "fixtures" / "kingston-2025-06.json"
case = json.loads((OUT / "case.json").read_text())

wb = Workbook()
inp = wb.active
inp.title = "Inputs"
names = {}


def param(name, value, note=""):
    r = inp.max_row + 1 if inp.max_row > 1 or inp["A1"].value else 1
    inp.cell(r, 1, name)
    inp.cell(r, 2, value)
    inp.cell(r, 3, note)
    ref = f"Inputs!$B${r}"
    wb.defined_names[name] = DefinedName(name, attr_text=ref)
    names[name] = ref


s, a, m, L, inv, bat = case["site"], case["array"], case["module"], case["losses"], case["inverter"], case["battery"]
param("lat", s["latitudeDeg"], "site latitude [deg]")
param("lon", s["longitudeDeg"], "site longitude [deg], east +")
param("utcoff", s["utcOffsetH"], "local time - UTC [h]")
param("tilt", a["tiltDeg"], "module tilt [deg]")
param("surfaz", a["azimuthDeg"], "module azimuth, clockwise from north [deg]")
param("albedo", a["albedo"])
param("pmax", m["pmaxW"], "module Pmax STC [W]")
param("vmp", m["vmpV"], "module Vmp STC [V]")
param("gamma", m["gammaPctPerC"] / 100, "Pmax temp coeff [1/C]")
param("beta", m["betaVocPctPerC"] / 100, "Voc/Vmp temp coeff [1/C]")
for i, st in enumerate(case["strings"], 1):
    param(f"n{i}", st["modules"], f"modules in string {i}")
    param(f"rw{i}", st["wireROhm"], f"string {i} wire loop R [ohm]")
    param(f"rc{i}", st["connectorROhm"], f"string {i} connectors R [ohm]")
param("soiling", L["soilingPct"] / 100)
param("age", L["ageFactor"], "(1-LID)(1-degradation)")
param("avail", L["availabilityPct"] / 100)
param("b0", L["iamB0"], "ASHRAE IAM coefficient")
param("u0", L["faimanU0"])
param("u1", L["faimanU1"])
param("gsc", L["solarConstantWm2"])
param("rated", inv["ratedAcW"])
param("maxpv", inv["maxPvInputW"])
param("standby", inv["standbyW"])
for k, (f, e) in enumerate(inv["efficiencyCurve"], 1):
    param(f"cf{k}", f, "efficiency curve: load fraction")
    param(f"ce{k}", e, "efficiency curve: efficiency")
param("invchg", inv["maxBatteryChargeW"])
param("invdis", inv["maxBatteryDischargeW"])
param("racw", inv["acWiringROhm"])
param("vac", inv["acVoltageV"])
param("cap", bat["capacityWh"])
param("minsoc", bat["minSoc"])
param("eta1", bat["roundTripEfficiency"] ** 0.5, "one-way battery efficiency = sqrt(round trip)")
param("batchg", bat["maxChargeW"])
param("batdis", bat["maxDischargeW"])
param("cold", bat["lowTempChargeCutoffC"])
param("soc0", bat["initialSoc"])
param("gridup", 1 if case["grid"]["up"] else 0)
param("expok", 1 if case["grid"]["exportAllowed"] else 0)
param("dt", 1, "step [h]")

# weather: hour-ending UTC values; the local hour h (UTC h - utcoff) uses the value ending at its end
wx = json.loads(FIXTURE.read_text())["hourly"]
idx = {t: i for i, t in enumerate(wx["time"])}
day = datetime.fromisoformat(s["date"]).replace(tzinfo=timezone.utc)

ws = wb.create_sheet("Hours")
cols = [
    ("hour", "local hour start"), ("utc", "UTC mid-step (serial)"),
    ("ghi", "GHI"), ("dni", "DNI"), ("dhi", "DHI"), ("ta", "air temp C"), ("wind", "wind m/s"),
    ("jd", "Julian day"), ("jc", "Julian century"), ("l0", "geom mean long"), ("m", "geom mean anom"),
    ("ecc", "eccentricity"), ("c", "eq of centre"), ("tl", "true long"), ("al", "apparent long"),
    ("mo", "mean obliquity"), ("oc", "obliquity corr"), ("dec", "declination"), ("vy", "var y"),
    ("eot", "equation of time min"), ("tst", "true solar time min"), ("ha", "hour angle"),
    ("zen", "geometric zenith"), ("el", "elevation"), ("ref", "refraction deg"), ("ael", "apparent elevation"),
    ("azen", "apparent zenith"), ("az", "azimuth"), ("doy", "day of year"), ("i0", "extraterrestrial DNI"),
    ("cosaoi", "cos AOI"), ("beam", "POA beam"), ("ai", "anisotropy index"), ("rb", "Rb"),
    ("sky", "POA sky diffuse"), ("gnd", "POA ground"), ("poa", "POA total"), ("iam", "IAM"),
    ("geff", "effective irradiance"), ("tc", "cell temp"), ("pmod", "module P"), ("vmod", "module Vmp"),
    ("p1", "string 1 P"), ("i1", "string 1 I"), ("p2", "string 2 P"), ("i2", "string 2 I"),
    ("pmppt", "MPPT P"), ("aged", "after ageing"), ("wire", "wire loss"), ("conn", "connector loss"),
    ("pvdcin", "PV DC to inverter"), ("load", "load"), ("demand", "load + standby"), ("f", "load fraction"),
    ("eta", "inverter efficiency"), ("pvdc", "PV DC after clipping"), ("pv2load", "PV to load AC"),
    ("surplus", "PV DC surplus"), ("deficit", "deficit AC"), ("acroom", "AC room"),
    ("offer", "offered to battery"), ("headroom", "battery headroom W"), ("accept", "battery accepts"),
    ("soc1", "SoC after charge"), ("surplus2", "surplus after battery"), ("export", "export AC"),
    ("curt", "curtailed DC"), ("acroom2", "AC room after export"), ("need", "battery need AC"),
    ("req", "battery request DC"), ("bavail", "battery available W"), ("deliv", "battery delivers DC"),
    ("bat2load", "battery to load AC"), ("soc", "SoC end"), ("grid", "grid import"),
    ("batw", "battery W (+chg)"), ("pvacraw", "PV AC raw"), ("acloss", "AC wiring loss"), ("pvac", "PV AC"),
]
col = {k: i + 1 for i, (k, _) in enumerate(cols)}
from openpyxl.utils import get_column_letter as L_

for k, label in cols:
    ws.cell(1, col[k], k)
    ws.cell(2, col[k], label)


def c(k, r):
    return f"{L_(col[k])}{r}"


lc = case["loads"]
for h in range(24):
    r = h + 3
    mid = day + timedelta(hours=h + 0.5 - s["utcOffsetH"])
    ending = (mid + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M")
    i = idx[ending]
    f = {
        "hour": h,
        "utc": f"=DATE({mid.year},{mid.month},{mid.day})+TIME({mid.hour},{mid.minute},0)",
        "ghi": wx["shortwave_radiation"][i], "dni": wx["direct_normal_irradiance"][i],
        "dhi": wx["diffuse_radiation"][i], "ta": wx["temperature_2m"][i], "wind": wx["wind_speed_10m"][i],
        "jd": f"={c('utc', r)}+2415018.5",
        "jc": f"=({c('jd', r)}-2451545)/36525",
        "l0": f"=MOD(280.46646+{c('jc', r)}*(36000.76983+{c('jc', r)}*0.0003032),360)",
        "m": f"=357.52911+{c('jc', r)}*(35999.05029-0.0001537*{c('jc', r)})",
        "ecc": f"=0.016708634-{c('jc', r)}*(0.000042037+0.0000001267*{c('jc', r)})",
        "c": f"=SIN(RADIANS({c('m', r)}))*(1.914602-{c('jc', r)}*(0.004817+0.000014*{c('jc', r)}))+SIN(RADIANS(2*{c('m', r)}))*(0.019993-0.000101*{c('jc', r)})+SIN(RADIANS(3*{c('m', r)}))*0.000289",
        "tl": f"={c('l0', r)}+{c('c', r)}",
        "al": f"={c('tl', r)}-0.00569-0.00478*SIN(RADIANS(125.04-1934.136*{c('jc', r)}))",
        "mo": f"=23+(26+((21.448-{c('jc', r)}*(46.815+{c('jc', r)}*(0.00059-{c('jc', r)}*0.001813))))/60)/60",
        "oc": f"={c('mo', r)}+0.00256*COS(RADIANS(125.04-1934.136*{c('jc', r)}))",
        "dec": f"=DEGREES(ASIN(SIN(RADIANS({c('oc', r)}))*SIN(RADIANS({c('al', r)}))))",
        "vy": f"=TAN(RADIANS({c('oc', r)}/2))^2",
        "eot": f"=4*DEGREES({c('vy', r)}*SIN(2*RADIANS({c('l0', r)}))-2*{c('ecc', r)}*SIN(RADIANS({c('m', r)}))+4*{c('ecc', r)}*{c('vy', r)}*SIN(RADIANS({c('m', r)}))*COS(2*RADIANS({c('l0', r)}))-0.5*{c('vy', r)}^2*SIN(4*RADIANS({c('l0', r)}))-1.25*{c('ecc', r)}^2*SIN(2*RADIANS({c('m', r)})))",
        "tst": f"=MOD(MOD({c('utc', r)},1)*1440+{c('eot', r)}+4*lon,1440)",
        "ha": f"=IF({c('tst', r)}/4<0,{c('tst', r)}/4+180,{c('tst', r)}/4-180)",
        "zen": f"=DEGREES(ACOS(SIN(RADIANS(lat))*SIN(RADIANS({c('dec', r)}))+COS(RADIANS(lat))*COS(RADIANS({c('dec', r)}))*COS(RADIANS({c('ha', r)}))))",
        "el": f"=90-{c('zen', r)}",
        "ref": f"=IF({c('el', r)}>85,0,IF({c('el', r)}>5,58.1/TAN(RADIANS({c('el', r)}))-0.07/TAN(RADIANS({c('el', r)}))^3+0.000086/TAN(RADIANS({c('el', r)}))^5,IF({c('el', r)}>-0.575,1735+{c('el', r)}*(-518.2+{c('el', r)}*(103.4+{c('el', r)}*(-12.79+{c('el', r)}*0.711))),-20.772/TAN(RADIANS({c('el', r)})))))/3600",
        "ael": f"={c('el', r)}+{c('ref', r)}",
        "azen": f"=90-{c('ael', r)}",
        "az": f"=IF({c('ha', r)}>0,MOD(DEGREES(ACOS(((SIN(RADIANS(lat))*COS(RADIANS({c('zen', r)})))-SIN(RADIANS({c('dec', r)})))/(COS(RADIANS(lat))*SIN(RADIANS({c('zen', r)})))))+180,360),MOD(540-DEGREES(ACOS(((SIN(RADIANS(lat))*COS(RADIANS({c('zen', r)})))-SIN(RADIANS({c('dec', r)})))/(COS(RADIANS(lat))*SIN(RADIANS({c('zen', r)}))))),360))",
        "doy": f"=INT({c('utc', r)})-DATE(YEAR({c('utc', r)}),1,1)+1",
        "i0": f"=gsc*(1+0.033*COS(2*PI()*{c('doy', r)}/365))",
        "cosaoi": f"=COS(RADIANS({c('azen', r)}))*COS(RADIANS(tilt))+SIN(RADIANS({c('azen', r)}))*SIN(RADIANS(tilt))*COS(RADIANS({c('az', r)}-surfaz))",
        "beam": f"=IF({c('ael', r)}>0,{c('dni', r)}*MAX({c('cosaoi', r)},0),0)",
        "ai": f"=MIN(1,MAX(0,{c('dni', r)}/{c('i0', r)}))",
        "rb": f"=MAX({c('cosaoi', r)},0)/MAX(COS(RADIANS({c('azen', r)})),COS(RADIANS(85)))",
        "sky": f"=IF({c('ael', r)}>0,{c('dhi', r)}*({c('ai', r)}*{c('rb', r)}+(1-{c('ai', r)})*(1+COS(RADIANS(tilt)))/2),{c('dhi', r)}*(1+COS(RADIANS(tilt)))/2)",
        "gnd": f"={c('ghi', r)}*albedo*(1-COS(RADIANS(tilt)))/2",
        "poa": f"={c('beam', r)}+{c('sky', r)}+{c('gnd', r)}",
        "iam": f"=IF({c('cosaoi', r)}<=0,0,MIN(1,MAX(0,1-b0*(1/{c('cosaoi', r)}-1))))",
        "geff": f"=({c('beam', r)}*{c('iam', r)}+{c('sky', r)}+{c('gnd', r)})*(1-soiling)",
        "tc": f"={c('ta', r)}+{c('geff', r)}/(u0+u1*MAX({c('wind', r)},0))",
        "pmod": f"=IF({c('geff', r)}<=0,0,pmax*{c('geff', r)}/1000*(1+gamma*({c('tc', r)}-25)))",
        "vmod": f"=IF({c('geff', r)}<=0,0,vmp*(1+beta*({c('tc', r)}-25)))",
        "p1": f"=n1*{c('pmod', r)}",
        "i1": f"=IF({c('vmod', r)}>0,{c('p1', r)}/(n1*{c('vmod', r)}),0)",
        "p2": f"=n2*{c('pmod', r)}",
        "i2": f"=IF({c('vmod', r)}>0,{c('p2', r)}/(n2*{c('vmod', r)}),0)",
        "pmppt": f"={c('p1', r)}+{c('p2', r)}",
        "aged": f"={c('pmppt', r)}*age",
        "wire": f"=({c('i1', r)}*age)^2*rw1+({c('i2', r)}*age)^2*rw2",
        "conn": f"=({c('i1', r)}*age)^2*rc1+({c('i2', r)}*age)^2*rc2",
        "pvdcin": f"=MAX(0,MAX(0,{c('aged', r)}-{c('wire', r)})-{c('conn', r)})*avail",
        "load": "=" + "+".join(
            f"{l['ratedW']}*{l['dutyPct']/100}" if l["kind"] == "always"
            else f"IF(AND({c('hour', r)}+0.5>={l['startH']},{c('hour', r)}+0.5<{l['endH']}),{l['ratedW']}*{l['dutyPct']/100},0)"
            for l in lc),
        "demand": f"={c('load', r)}+standby",
        "f": f"=MIN(1,{c('demand', r)}/rated)",
        "eta": f"=IF({c('f', r)}<=cf1,ce1,IF({c('f', r)}<=cf2,ce1+({c('f', r)}-cf1)/(cf2-cf1)*(ce2-ce1),IF({c('f', r)}<=cf3,ce2+({c('f', r)}-cf2)/(cf3-cf2)*(ce3-ce2),IF({c('f', r)}<=cf4,ce3+({c('f', r)}-cf3)/(cf4-cf3)*(ce4-ce3),IF({c('f', r)}<=cf5,ce4+({c('f', r)}-cf4)/(cf5-cf4)*(ce5-ce4),ce5)))))",
        "pvdc": f"=MIN({c('pvdcin', r)},maxpv)",
        "pv2load": f"=MIN({c('pvdc', r)}*{c('eta', r)},{c('demand', r)},rated)",
        "surplus": f"={c('pvdc', r)}-{c('pv2load', r)}/{c('eta', r)}",
        "deficit": f"={c('demand', r)}-{c('pv2load', r)}",
        "acroom": f"=rated-{c('pv2load', r)}",
        "offer": f"=IF({c('surplus', r)}>0,MIN({c('surplus', r)},invchg),0)",
        "headroom": f"=MAX(0,(1-{'soc0' if h == 0 else c('soc', r - 1)})*cap/(eta1*dt))",
        "accept": f"=IF(OR({c('offer', r)}<=0,{c('ta', r)}<cold),0,MIN({c('offer', r)},batchg,{c('headroom', r)}))",
        "soc1": f"=MIN(1,{'soc0' if h == 0 else c('soc', r - 1)}+{c('accept', r)}*eta1*dt/cap)",
        "surplus2": f"={c('surplus', r)}-{c('accept', r)}",
        "export": f"=IF(AND({c('surplus2', r)}>0,gridup=1,expok=1),MIN({c('surplus2', r)}*{c('eta', r)},{c('acroom', r)}),0)",
        "curt": f"=MAX(0,{c('surplus2', r)}-{c('export', r)}/{c('eta', r)})",
        "acroom2": f"={c('acroom', r)}-{c('export', r)}",
        "need": f"=IF({c('deficit', r)}>0,MIN({c('deficit', r)},MAX(0,{c('acroom2', r)})),0)",
        "req": f"=MIN({c('need', r)}/{c('eta', r)},invdis)",
        "bavail": f"=MAX(0,({c('soc1', r)}-minsoc)*cap*eta1/dt)",
        "deliv": f"=MIN({c('req', r)},batdis,{c('bavail', r)})",
        "bat2load": f"={c('deliv', r)}*{c('eta', r)}",
        "soc": f"=MAX(minsoc,{c('soc1', r)}-{c('deliv', r)}/eta1*dt/cap)",
        "grid": f"=IF(gridup=1,MAX(0,{c('deficit', r)}-{c('bat2load', r)}),0)",
        "batw": f"={c('accept', r)}-{c('deliv', r)}",
        "pvacraw": f"={c('pv2load', r)}+{c('export', r)}",
        "acloss": f"=MIN({c('pvacraw', r)},({c('pvacraw', r)}/vac)^2*racw)",
        "pvac": f"={c('pvacraw', r)}-{c('acloss', r)}",
    }
    for k, v in f.items():
        ws.cell(r, col[k], v)

tot = 27
ws.cell(tot, 1, "TOTAL kWh")
for k in ["poa", "pvdcin", "pvac", "load", "grid", "export", "accept", "deliv", "curt"]:
    ws.cell(tot, col[k], f"=SUM({c(k, 3)}:{c(k, 26)})/1000")
ws.cell(tot + 1, 1, "PSH (POA kWh/m2/day)")
ws.cell(tot + 1, col["poa"], f"={c('poa', tot)}")

OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    raw = Path(tmp) / "day-check.xlsx"
    wb.save(raw)
    calc = Path(tmp) / "calc"
    subprocess.run(
        ["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", str(calc), str(raw)],
        check=True, capture_output=True, timeout=180,
    )
    shutil.copy(calc / "day-check.xlsx", OUT / "day-check.xlsx")

vals = load_workbook(OUT / "day-check.xlsx", data_only=True)["Hours"]
keep = ["hour", "poa", "tc", "pvdcin", "pvac", "load", "soc", "batw", "grid", "export"]
with open(OUT / "expected.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(keep)
    for r in range(3, 27):
        row = [vals.cell(r, col[k]).value for k in keep]
        if any(v is None for v in row):
            raise SystemExit(f"LibreOffice left an empty result in row {r}: {row}")
        w.writerow([row[0]] + [f"{float(v):.6f}" for v in row[1:]])
print("wrote", OUT / "day-check.xlsx", "and", OUT / "expected.csv")
print("totals (kWh):", {k: round(float(vals.cell(tot, col[k]).value), 3) for k in ["poa", "pvdcin", "pvac", "load", "grid", "export", "accept", "deliv"]})
