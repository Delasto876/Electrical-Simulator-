import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { portsFromObject } from "./glbPorts";

function portNode(name: string, userData: Record<string, unknown>) {
  // name mimics what GLTFLoader produces after sanitising; detection uses userData.port_id
  const n = new Object3D();
  n.name = name;
  n.userData = userData;
  return n;
}

describe("portsFromObject", () => {
  it("reads id, extras and +Y direction (as exported by Blender for the test cube)", () => {
    const root = new Object3D();
    const port = portNode("port_top", { port_id: "top", type: "ground-point", polarity: "PE" });
    port.position.set(0, 0.4, 0);
    // Exact rotation the Blender exporter wrote for test-cube.glb: 180° about Y.
    port.quaternion.set(0, -1, 0, 4.37e-8);
    root.add(port, new Object3D());
    expect(portsFromObject(root)).toEqual([
      {
        id: "top",
        type: "ground-point",
        polarity: "PE",
        gender: undefined,
        position: [0, 0.4, 0],
        direction: [0, 1, 0],
      },
    ]);
  });

  it("expresses position and direction in the root frame even when the root is transformed", () => {
    const root = new Object3D();
    root.position.set(5, 5, 5);
    root.rotation.set(0, 0, Math.PI / 2);
    const port = portNode("port_side", { port_id: "pv1+", type: "mc4", gender: "male" });
    port.position.set(0.1, 0, 0);
    port.rotation.set(0, 0, -Math.PI / 2); // local +Y now points along root +X
    root.add(port);
    const [p] = portsFromObject(root);
    expect(p?.position).toEqual([0.1, 0, 0]);
    expect(p?.direction).toEqual([1, 0, 0]);
    expect(p?.gender).toBe("male");
    expect(p?.id).toBe("pv1+");
  });

  it("ignores nodes without a port_id, whatever their name", () => {
    const root = new Object3D();
    root.add(portNode("body", {}), portNode("port_fake", { type: "mc4" }));
    expect(portsFromObject(root)).toEqual([]);
  });
});
