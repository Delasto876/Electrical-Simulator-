import { Grid } from "@react-three/drei";

/**
 * Ground: a lit disc that receives the surface's shadow, and the adaptive grid
 * (1 m cells, heavier every 5 m, fading with distance).
 */
export function Ground({
  size,
  theme,
  color,
  grid,
}: {
  size: number;
  theme: "dark" | "light";
  /** Ground colour (from the environment preset). */
  color: string;
  grid: boolean;
}) {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.002, 0]}
        receiveShadow
        raycast={() => undefined}
      >
        <circleGeometry args={[size, 64]} />
        <meshStandardMaterial color={color} roughness={1} metalness={0} />
      </mesh>
      {grid && (
        <Grid
          position={[0, -0.0015, 0]}
          args={[10, 10]}
          infiniteGrid
          cellSize={1}
          cellThickness={0.6}
          cellColor={theme === "dark" ? "#59636f" : "#9aa2ac"}
          sectionSize={5}
          sectionThickness={1.1}
          sectionColor={theme === "dark" ? "#7b8896" : "#6f7884"}
          fadeDistance={Math.max(60, size * 0.15)}
          fadeStrength={1.4}
        />
      )}
    </group>
  );
}
