import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Box3,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { base64ToBytes, modelFileUrl } from "../../parts/modelLoader";
import { IdbKv, MemoryKv, type KeyValueStore } from "../lib/kv";
import { DIN_MODULE_MM } from "@solar-sim/engine";
import type { PartInfo } from "../model/partInfo";

/**
 * PART THUMBNAILS — each library card shows a real render of the part: one
 * shared offscreen renderer draws the part's glb (or its procedural shape, or
 * a custom part with its photo on the front) to a small PNG. Results are cached
 * in memory and in IndexedDB, keyed by part and a hash of what it looks like,
 * so a changed model or custom part is redrawn. Renders run one at a time.
 */
const SIZE = 112;
const AS_TEXT = import.meta.env.VITE_MODELS_AS_TEXT === "1";
const VERSION = "t1";

let kv: KeyValueStore | undefined;
const store = (): KeyValueStore => {
  kv ??= typeof indexedDB === "undefined" ? new MemoryKv() : new IdbKv();
  return kv;
};

/** Small string hash (FNV-1a) of what determines a part's picture. */
export function thumbKey(info: PartInfo): string {
  const src = JSON.stringify([
    info.id,
    info.footprint,
    info.heightM,
    info.color,
    info.modelFile ?? "",
    info.enclosure ?? "",
    info.photo ? info.photo.length : 0,
    info.photo ? info.photo.slice(-64) : "",
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `thumb:${VERSION}:${info.id}:${h.toString(16)}`;
}

let renderer: WebGLRenderer | null | undefined;
let envMap: Scene["environment"] = null;
function getRenderer(): WebGLRenderer | null {
  if (renderer !== undefined) return renderer;
  try {
    const canvas = document.createElement("canvas");
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = SRGBColorSpace;
    const pm = new PMREMGenerator(renderer);
    envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  } catch {
    renderer = null; // no WebGL (tests, blocked): cards keep their text badge
  }
  return renderer;
}

const gltfCache = new Map<string, Promise<Object3D>>();
const bytesOf = async (r: Response): Promise<ArrayBuffer> =>
  AS_TEXT ? (base64ToBytes(await r.text()).buffer as ArrayBuffer) : r.arrayBuffer();
function loadGlb(file: string): Promise<Object3D> {
  let p = gltfCache.get(file);
  if (!p) {
    const url = modelFileUrl(file);
    const loader = new GLTFLoader();
    p = fetch(url)
      .then((r) => (r.ok ? bytesOf(r) : Promise.reject(new Error(url))))
      .then(
        (buf) =>
          new Promise<Object3D>((resolve, reject) => {
            loader.parse(buf, "", (g) => resolve(g.scene), reject);
          }),
      );
    gltfCache.set(file, p);
  }
  return p;
}

const mat = (color: string, metal = 0.3, rough = 0.55) =>
  new MeshStandardMaterial({ color: new Color(color), metalness: metal, roughness: rough });

async function buildObject(info: PartInfo): Promise<Object3D> {
  const g = new Group();
  const { w, d } = info.footprint;
  const h = info.heightM;
  if (info.enclosure) {
    const body = new Mesh(new BoxGeometry(w, h, d), mat("#d9dde2"));
    body.position.y = h / 2;
    g.add(body);
    const front = new Mesh(
      new BoxGeometry(w * 0.92, h * 0.92, 0.004),
      new MeshStandardMaterial({ color: "#9fb4c8", transparent: true, opacity: 0.45 }),
    );
    front.position.set(0, h / 2, d / 2 + 0.003);
    g.add(front);
    const rails = info.enclosure.rows;
    for (let r = 0; r < rails; r++) {
      const rail = new Mesh(
        new BoxGeometry((info.enclosure.modulesPerRow * DIN_MODULE_MM) / 1000, 0.035, 0.01),
        mat("#aeb4bb", 0.85, 0.35),
      );
      rail.position.set(
        0,
        rails === 1 ? h / 2 : h * (0.78 - (0.56 * r) / (rails - 1)),
        d / 2 + 0.008,
      );
      g.add(rail);
    }
    return g;
  }
  if (info.modelFile && !info.legRole) {
    try {
      const m = (await loadGlb(info.modelFile)).clone(true);
      g.add(m);
      return g;
    } catch {
      /* fall back to a box */
    }
  }
  const front = info.photo
    ? await new Promise<MeshStandardMaterial | undefined>((resolve) => {
        new TextureLoader().load(
          info.photo!,
          (t) => {
            t.colorSpace = SRGBColorSpace;
            resolve(new MeshStandardMaterial({ map: t, roughness: 0.6 }));
          },
          undefined,
          () => resolve(undefined),
        );
      })
    : undefined;
  const base = mat(info.color, info.category === "battery" ? 0.2 : 0.5);
  const box = new Mesh(
    new BoxGeometry(w, h, d),
    front ? [base, base, base, base, front, base] : base,
  );
  box.position.y = h / 2;
  g.add(box);
  return g;
}

function render(obj: Object3D): string | undefined {
  const r = getRenderer();
  if (!r) return undefined;
  const scene = new Scene();
  scene.environment = envMap;
  scene.add(new AmbientLight("#ffffff", 0.5));
  scene.add(new HemisphereLight("#cfe0ff", "#3a3a3a", 0.7));
  const sun = new DirectionalLight("#ffffff", 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  scene.add(obj);
  const box = new Box3().setFromObject(obj);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const radius = Math.max(size.length() / 2, 1e-3);
  const cam = new PerspectiveCamera(30, 1, radius / 20, radius * 40);
  const dist = (radius / Math.sin((30 * Math.PI) / 360)) * 0.9;
  cam.position.copy(centre).add(new Vector3(0.75, 0.55, 1).normalize().multiplyScalar(dist));
  cam.lookAt(centre);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  scene.traverse((o) => {
    const m = o as Mesh;
    if (m.geometry && !(m.geometry as { userData?: { shared?: boolean } }).userData?.shared)
      m.geometry.dispose?.();
  });
  return url;
}

const memory = new Map<string, string>();
let chain: Promise<unknown> = Promise.resolve();

/** The picture of a part as a PNG data URL, or undefined when it cannot be drawn here. */
export function getThumbnail(info: PartInfo): Promise<string | undefined> {
  const key = thumbKey(info);
  const hit = memory.get(key);
  if (hit) return Promise.resolve(hit);
  const job = chain.then(async () => {
    const again = memory.get(key);
    if (again) return again;
    try {
      const cached = await store().get<string>(key);
      if (cached) {
        memory.set(key, cached);
        return cached;
      }
    } catch {
      /* storage blocked: draw it */
    }
    try {
      const url = render(await buildObject(info));
      if (url) {
        memory.set(key, url);
        void store()
          .set(key, url)
          .catch(() => undefined);
      }
      return url;
    } catch {
      return undefined;
    }
  });
  chain = job.catch(() => undefined);
  return job;
}
