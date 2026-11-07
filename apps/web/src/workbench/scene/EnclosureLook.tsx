import { Suspense } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { DIN_MODULE_MM } from "@solar-sim/engine";
import type { PartInfo } from "../model/partInfo";
import { Box, PhotoBox } from "./LookPrimitives";

/**
 * ENCLOSURE LOOK — a DIN box drawn from its catalog data: back plate, walls,
 * DIN rails, the devices clicked onto them, the inner cover (with the 45 mm
 * window the device fronts show through) and the hinged front door. With the
 * cover open, the door swings out on its left hinge and the inner cover is
 * lifted off, so the devices can be clicked and wired.
 *
 * Local frame: origin at the middle of the box's bottom edge, x across the
 * width, y up the height, z out of the front (back plate at −d/2).
 */
export interface MountedDevice {
  id: string;
  nodeId?: string;
  info: PartInfo;
  row: number;
  slot: number;
  selected?: boolean;
}

/** Vertical position of a DIN rail row inside an enclosure [m]. */
export const railY = (row: number, rows: number, h: number): number =>
  rows === 1 ? h * 0.5 : h * (0.78 - (0.56 * row) / (rows - 1));

/** The door's swing when open [rad] (about its left hinge, outwards). */
export const DOOR_OPEN_RAD = 1.9;

const WALL = 0.006;
const WINDOW_M = 0.047; // the 45 mm device-front window, with a little play

const BODY = "#eceef0";
const LEVER: Record<string, string> = {
  "mcb-ac": "#1d1f22",
  rcbo: "#1d1f22",
  rcd: "#1d1f22",
  "mcb-dc": "#c8312b",
  "isolator-dc": "#c8312b",
  "isolator-ac": "#c8312b",
};

/** One DIN device, detailed by kind: stepped body, lever, SPD cartridges, display, knob. */
export function DinDeviceLook({
  info,
  pos,
  size,
  selected,
  onClick,
}: {
  info: PartInfo;
  pos: [number, number, number];
  size: [number, number, number];
  selected?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const [w, h, d] = size;
  const kind = info.dinKind ?? "mcb-ac";
  const poles = Math.max(1, info.poles ?? info.dinModules ?? 1);
  const humpD = Math.min(0.012, d * 0.2);
  const bodyD = d - humpD;
  const front = d / 2; // front of the hump (local)
  const hy = Math.min(WINDOW_M - 0.004, h * 0.5);
  const body = info.color === "#e8eaee" ? BODY : info.color;
  const pole = w / poles;
  const parts: React.ReactNode[] = [];
  const add = (
    key: string,
    s: [number, number, number],
    p: [number, number, number],
    c: string,
    extra: Partial<Parameters<typeof Box>[0]> = {},
  ) =>
    parts.push(<Box key={key} size={s} pos={p} color={c} raycast={false} rough={0.5} {...extra} />);

  if (kind === "spd-ac" || kind === "spd-dc") {
    // plug-in cartridges, one per pole, each with a green status window
    for (let i = 0; i < poles; i++) {
      const x = -w / 2 + pole * (i + 0.5);
      add(
        `c${i}`,
        [pole - 0.0015, hy, 0.004],
        [x, 0, front + 0.001],
        kind === "spd-dc" ? "#d9dde1" : "#e3e5e8",
      );
      add(`g${i}`, [pole * 0.45, 0.006, 0.002], [x, hy * 0.28, front + 0.0035], "#2fbf55", {
        emissive: "#1d7a34",
      });
    }
  } else if (kind === "voltage-protector") {
    add("lcd", [w * 0.78, hy * 0.36, 0.002], [0, hy * 0.12, front + 0.001], "#101418");
    add("dig", [w * 0.6, hy * 0.18, 0.001], [0, hy * 0.12, front + 0.0025], "#ff3b30", {
      emissive: "#ff3b30",
    });
    for (let i = 0; i < 3; i++)
      add(
        `b${i}`,
        [w * 0.14, w * 0.1, 0.003],
        [-w * 0.25 + i * w * 0.25, -hy * 0.3, front + 0.0015],
        "#5a6068",
      );
  } else if (kind === "changeover") {
    parts.push(
      <mesh
        key="knob"
        position={[0, 0, front + 0.006]}
        rotation={[Math.PI / 2, 0, 0]}
        raycast={() => undefined}
      >
        <cylinderGeometry args={[Math.min(w, hy) * 0.32, Math.min(w, hy) * 0.36, 0.012, 20]} />
        <meshStandardMaterial color="#1d1f22" roughness={0.45} />
      </mesh>,
    );
    add("bar", [Math.min(w, hy) * 0.6, 0.006, 0.004], [0, 0, front + 0.013], "#d7dade");
  } else if (kind === "ats-din") {
    add("lever", [w * 0.18, hy * 0.42, 0.012], [-w * 0.18, 0, front + 0.006], "#1d1f22");
    add("led1", [0.004, 0.004, 0.002], [w * 0.2, hy * 0.25, front + 0.001], "#2fbf55", {
      emissive: "#2fbf55",
    });
    add("led2", [0.004, 0.004, 0.002], [w * 0.32, hy * 0.25, front + 0.001], "#ff3b30", {
      emissive: "#7a1d1d",
    });
  } else if (kind === "fuse-holder-dc") {
    add("carrier", [w * 0.7, hy * 0.9, 0.01], [0, 0, front + 0.005], "#2b2e33");
  } else if (kind === "terminal-block") {
    for (let i = 0; i < poles; i++)
      add(
        `t${i}`,
        [pole - 0.001, hy, 0.003],
        [-w / 2 + pole * (i + 0.5), 0, front + 0.001],
        i % 2 ? "#4a7bd0" : "#9aa1a9",
      );
  } else {
    // breakers, RCDs and isolators: one lever per pole (joined by a handle tie)
    const lever = LEVER[kind] ?? "#1d1f22";
    for (let i = 0; i < poles; i++)
      add(
        `l${i}`,
        [pole * 0.42, hy * 0.36, 0.011],
        [-w / 2 + pole * (i + 0.5), hy * 0.08, front + 0.0055],
        lever,
      );
    if (poles > 1) add("tie", [w * 0.86, 0.004, 0.004], [0, hy * 0.08, front + 0.011], lever);
    if (kind === "rcd" || kind === "rcbo")
      add("test", [0.006, 0.006, 0.004], [w / 2 - 0.006, -hy * 0.32, front + 0.002], "#f2c230");
    add("label", [w * 0.8, 0.006, 0.0008], [0, -hy * 0.36, front + 0.0004], "#9aa1a9");
  }
  return (
    <group position={pos} {...(onClick ? { onClick } : {})} name={`din-${info.id}`}>
      {/* stepped body: the deep base on the rail, the 45 mm hump through the cover window */}
      <Box size={[w, h, bodyD]} pos={[0, 0, -humpD / 2]} color={body} rough={0.55} metal={0.05} />
      <Box
        size={[w, hy, humpD]}
        pos={[0, 0, front - humpD / 2]}
        color={body}
        rough={0.5}
        metal={0.05}
      />
      {parts}
      {selected && (
        <Box
          size={[w + 0.004, h + 0.004, d + 0.004]}
          pos={[0, 0, 0]}
          color="#ffb020"
          opacity={0.28}
          raycast={false}
        />
      )}
    </group>
  );
}

export function EnclosureLook({
  info,
  devices,
  open,
  onDevice,
}: {
  info: PartInfo;
  devices: MountedDevice[];
  /** Cover off / door open: devices visible and clickable. */
  open: boolean;
  onDevice?: (dv: MountedDevice, e: ThreeEvent<MouseEvent>) => void;
}) {
  const { w, d } = info.footprint;
  const h = info.heightM;
  const cfg = info.enclosure ?? { modulesPerRow: 12, rows: 1 };
  const metal = cfg.material === "metal";
  const shell = metal ? "#c9ced4" : "#e3e6ea";
  const railW = (cfg.modulesPerRow * DIN_MODULE_MM) / 1000;
  const dd = Math.min(0.065, d - 0.04);
  const deviceFront = -d / 2 + 0.02 + dd;
  const coverZ = Math.min(d / 2 - WALL - 0.004, deviceFront + 0.002);
  const rows = Array.from({ length: cfg.rows }, (_, r) => railY(r, cfg.rows, h));
  // inner cover: plates between the device windows, from the bottom wall to the top wall
  const edges = [WALL, ...rows.flatMap((y) => [y - WINDOW_M / 2, y + WINDOW_M / 2]), h - WALL];
  const plates: [number, number][] = [];
  for (let i = 0; i + 1 < edges.length; i += 2) plates.push([edges[i]!, edges[i + 1]!]);
  const doorColor = metal ? "#bfc5cc" : cfg.transparentDoor === false ? "#d9dce0" : "#6f8090";
  const doorOpacity = metal || cfg.transparentDoor === false ? 1 : open ? 0.45 : 0.32;
  return (
    <group>
      <Box size={[w, h, WALL * 2]} pos={[0, h / 2, -d / 2 + WALL]} color={shell} />
      <Box size={[w, WALL * 2, d]} pos={[0, h - WALL, 0]} color={shell} />
      <Box size={[w, WALL * 2, d]} pos={[0, WALL, 0]} color={shell} />
      <Box size={[WALL * 2, h, d]} pos={[-w / 2 + WALL, h / 2, 0]} color={shell} />
      <Box size={[WALL * 2, h, d]} pos={[w / 2 - WALL, h / 2, 0]} color={shell} />
      {rows.map((y, r) => (
        <Box
          key={r}
          size={[railW, 0.035, 0.008]}
          pos={[0, y, -d / 2 + 0.016]}
          color="#aeb4bb"
          metal={0.85}
          rough={0.35}
        />
      ))}
      {devices.map((dv) => {
        const mod = dv.info.dinModules ?? 1;
        const x = -railW / 2 + ((dv.slot + mod / 2) * DIN_MODULE_MM) / 1000;
        const dh = Math.min(0.09, dv.info.heightM);
        const dpos: [number, number, number] = [
          x,
          railY(dv.row, cfg.rows, h),
          -d / 2 + 0.02 + dd / 2,
        ];
        const dsize: [number, number, number] = [(mod * DIN_MODULE_MM) / 1000 - 0.001, dh, dd];
        const click = open && onDevice ? (e: ThreeEvent<MouseEvent>) => onDevice(dv, e) : undefined;
        if (dv.info.photo)
          return (
            <Suspense key={dv.id} fallback={<Box size={dsize} pos={dpos} color={dv.info.color} />}>
              <PhotoBox size={dsize} pos={dpos} photo={dv.info.photo} color={dv.info.color} />
            </Suspense>
          );
        return (
          <DinDeviceLook
            key={dv.id}
            info={dv.info}
            pos={dpos}
            size={dsize}
            {...(dv.selected ? { selected: true } : {})}
            {...(click ? { onClick: click } : {})}
          />
        );
      })}
      {!open &&
        plates.map(([a, b], i) =>
          b - a > 0.002 ? (
            <Box
              key={`plate-${i}`}
              size={[w - WALL * 2, b - a, 0.003]}
              pos={[0, (a + b) / 2, coverZ]}
              color={shell}
              testName="inner-cover"
            />
          ) : null,
        )}
      {/* the door, hinged on the left front edge */}
      <group position={[-w / 2, h / 2, d / 2]} rotation={[0, open ? -DOOR_OPEN_RAD : 0, 0]}>
        <Box
          size={[w, h, 0.004]}
          pos={[w / 2, 0, -0.002]}
          color={doorColor}
          opacity={doorOpacity}
          metal={metal ? 0.5 : 0.1}
          rough={0.25}
          testName="door"
        />
        <Box
          size={[0.012, 0.03, 0.006]}
          pos={[w - 0.012, 0, 0.002]}
          color="#3a3f47"
          raycast={false}
        />
      </group>
    </group>
  );
}
