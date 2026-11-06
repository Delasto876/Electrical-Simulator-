import { useLoader } from "@react-three/fiber";
import { LoaderUtils } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { modelUrl } from "./registry";

/**
 * Loads a part's glb. Normal builds fetch apps/web/public/models/<file>.
 * Builds for hosts that do not serve .glb (the published claude.ai page) set
 * VITE_MODELS_AS_TEXT=1 and ship each model as base64 text (<file>.txt); this
 * loader decodes it and parses the same glb bytes.
 */
const AS_TEXT = import.meta.env.VITE_MODELS_AS_TEXT === "1";

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class TextGltfLoader extends GLTFLoader {
  override load(
    url: string,
    onLoad: (gltf: GLTF) => void,
    _onProgress?: (e: ProgressEvent) => void,
    onError?: (e: unknown) => void,
  ): void {
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${url}`))))
      .then((t) => {
        const bytes = base64ToBytes(t);
        this.parse(bytes.buffer as ArrayBuffer, LoaderUtils.extractUrlBase(url), onLoad, onError);
      })
      .catch((e: unknown) => onError?.(e));
  }
}

export function modelFileUrl(file: string): string {
  return AS_TEXT ? `${modelUrl(file)}.txt` : modelUrl(file);
}

/** The glTF of a part model (suspends while loading; cached per URL). */
export function useModel(file: string): GLTF {
  return useLoader(AS_TEXT ? TextGltfLoader : GLTFLoader, modelFileUrl(file));
}
