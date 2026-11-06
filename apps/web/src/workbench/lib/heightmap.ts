/**
 * Height field → tangent-space normal map (OpenGL convention: +Y up in the
 * texture, as three.js expects). Sampling wraps around, so a tileable height
 * field gives a tileable normal map. `strength` scales the slope.
 */
export function heightToNormalRGBA(
  height: Float32Array,
  size: number,
  strength: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength; // image y is down, texture v is up
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      out[i] = (nx / len) * 127.5 + 127.5;
      out[i + 1] = (ny / len) * 127.5 + 127.5;
      out[i + 2] = (1 / len) * 127.5 + 127.5;
      out[i + 3] = 255;
    }
  return out;
}
