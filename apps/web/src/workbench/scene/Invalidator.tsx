import { useEffect } from "react";
import { invalidate } from "@react-three/fiber";
import { useView } from "../state/wbView";
import { usePlace } from "../state/placeState";
import { useWb } from "../state/wbStore";

/** The canvas renders on demand: redraw whenever the document or the view state changes. */
export function Invalidator() {
  useEffect(() => {
    const a = useWb.subscribe(() => invalidate());
    const b = useView.subscribe(() => invalidate());
    const c = usePlace.subscribe(() => invalidate());
    invalidate();
    return () => {
      a();
      b();
      c();
    };
  }, []);
  return null;
}
