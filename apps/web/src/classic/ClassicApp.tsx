import "../styles/app.css";
import { App } from "../app/App";

/**
 * The first-generation designer (roof-based). Kept reachable at `#/classic`
 * while its features are rebuilt in the Workbench; it brings its own CSS, so
 * it is loaded as a separate chunk and never mixes with the Workbench styles.
 */
export default function ClassicApp() {
  return <App />;
}
