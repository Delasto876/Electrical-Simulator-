import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from "three";
import { skinHeightM, skinSamples, type SurfaceSpec, type SurfaceType } from "@solar-sim/engine";

/**
 * GEOMETRY of a Work Surface (pure three.js BufferGeometry builders, tested
 * without a renderer). UVs are in tiles: position in metres ÷ tileM, so a
 * texture repeats once per `tileM` metres and details come out at real size.
 */
export const SKIN_TYPES: readonly SurfaceType[] = ["zinc", "decromastic", "standing-seam", "tile"];
export const hasSkin = (t: SurfaceType) => SKIN_TYPES.includes(t);

/** The skin (corrugated sheet, tiles, seams) as a height-field mesh over the plane; y = height above the plane. */
export function buildSkinGeometry(spec: SurfaceSpec, tileM: number): BufferGeometry {
  const { xs, zs } = skinSamples(spec);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i]!;
      const z = zs[j]!;
      pos[k * 3] = x;
      pos[k * 3 + 1] = skinHeightM(spec, x, z);
      pos[k * 3 + 2] = z;
      uv[k * 2] = x / tileM;
      uv[k * 2 + 1] = z / tileM;
    }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // counter-clockwise seen from +Y (up)
      idx[t++] = a;
      idx[t++] = c;
      idx[t++] = b;
      idx[t++] = b;
      idx[t++] = c;
      idx[t++] = d;
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(new Uint32BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

type V = [number, number, number];

/**
 * A slab: top face at y = topY, extending `thickM` down, `w` across (x) and
 * `d` deep (z), centred on the origin in x and z. `chamferM` bevels the top
 * edge. Material groups: 0 = top, 1 = sides and bevel, 2 = bottom.
 */
export function buildSlabGeometry(
  w: number,
  d: number,
  thickM: number,
  topY: number,
  chamferM: number,
  tileM: number,
): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  const hx = w / 2;
  const hz = d / 2;
  const c = Math.min(chamferM, hx * 0.5, hz * 0.5, thickM * 0.9);
  const yBottom = topY - thickM;
  const ySide = topY - c;

  const quad = (p0: V, p1: V, p2: V, p3: V, material: number) => {
    const e1: V = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2: V = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    let n: V = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const l = Math.hypot(...n) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    const base = pos.length / 3;
    for (const p of [p0, p1, p2, p3]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      if (ay >= ax && ay >= az) uv.push(p[0] / tileM, p[2] / tileM);
      else if (ax >= az) uv.push(p[2] / tileM, p[1] / tileM);
      else uv.push(p[0] / tileM, p[1] / tileM);
    }
    const start = idx.length;
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    const last = groups[groups.length - 1];
    if (last && last.materialIndex === material && last.start + last.count === start)
      last.count += 6;
    else groups.push({ start, count: 6, materialIndex: material });
  };

  // top (material 0), then sides and bevel (1), then bottom (2): groups stay contiguous
  quad(
    [-hx + c, topY, -hz + c],
    [-hx + c, topY, hz - c],
    [hx - c, topY, hz - c],
    [hx - c, topY, -hz + c],
    0,
  );
  quad([-hx, yBottom, hz], [hx, yBottom, hz], [hx, ySide, hz], [-hx, ySide, hz], 1);
  quad([hx, yBottom, -hz], [-hx, yBottom, -hz], [-hx, ySide, -hz], [hx, ySide, -hz], 1);
  quad([hx, yBottom, hz], [hx, yBottom, -hz], [hx, ySide, -hz], [hx, ySide, hz], 1);
  quad([-hx, yBottom, -hz], [-hx, yBottom, hz], [-hx, ySide, hz], [-hx, ySide, -hz], 1);
  if (c > 0) {
    quad([-hx, ySide, hz], [hx, ySide, hz], [hx - c, topY, hz - c], [-hx + c, topY, hz - c], 1);
    quad([hx, ySide, -hz], [-hx, ySide, -hz], [-hx + c, topY, -hz + c], [hx - c, topY, -hz + c], 1);
    quad([hx, ySide, hz], [hx, ySide, -hz], [hx - c, topY, -hz + c], [hx - c, topY, hz - c], 1);
    quad([-hx, ySide, -hz], [-hx, ySide, hz], [-hx + c, topY, hz - c], [-hx + c, topY, -hz + c], 1);
  }
  quad([-hx, yBottom, -hz], [hx, yBottom, -hz], [hx, yBottom, hz], [-hx, yBottom, hz], 2);

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // merge contiguous groups per material in order 0, 1, 2
  const merged: { start: number; count: number; materialIndex: number }[] = [];
  for (const m of [0, 1, 2]) {
    const gs = groups.filter((x) => x.materialIndex === m);
    if (!gs.length) continue;
    // groups of one material are contiguous by construction except the bevel quads, which follow the sides
    merged.push({
      start: gs[0]!.start,
      count: gs.reduce((s, x) => s + x.count, 0),
      materialIndex: m,
    });
  }
  g.clearGroups();
  for (const m of merged) g.addGroup(m.start, m.count, m.materialIndex);
  g.computeBoundingBox();
  return g;
}
