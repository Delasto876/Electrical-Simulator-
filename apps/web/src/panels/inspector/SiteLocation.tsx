import { useState } from "react";
import { setSite } from "../../state/actions";
import { useProject } from "../../state/projectStore";
import { searchPlaces, WeatherError } from "../../weather/openMeteo";
import type { Place } from "../../weather/types";
import { NumberField, Section } from "./fields";

/** Site location: search any town worldwide (Open-Meteo geocoding) or type coordinates. */
export function SiteLocation() {
  const site = useProject((s) => s.project.site);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchPlaces(query.trim()));
    } catch (e) {
      setError(e instanceof WeatherError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Location">
      <p data-testid="site-name">
        <strong>{site.name}</strong> · {site.latitudeDeg.toFixed(4)}°,{" "}
        {site.longitudeDeg.toFixed(4)}° · {site.timeZone}
      </p>
      <form
        className="insp-inline"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          type="search"
          placeholder="Search a town or city…"
          aria-label="Search a place"
          value={query}
          data-testid="site-search"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Search"}
        </button>
      </form>
      {error && <p className="bond-bad">{error}</p>}
      {results && (
        <ul className="object-list" data-testid="site-results">
          {results.length === 0 && <li className="muted">No place found.</li>}
          {results.map((r) => (
            <li key={`${r.latitudeDeg},${r.longitudeDeg}`}>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSite({
                    name: r.label,
                    latitudeDeg: r.latitudeDeg,
                    longitudeDeg: r.longitudeDeg,
                    timeZone: r.timeZone,
                  });
                  setResults(null);
                  setQuery("");
                }}
              >
                {r.label}
              </button>{" "}
              <span className="muted">
                {r.latitudeDeg.toFixed(2)}°, {r.longitudeDeg.toFixed(2)}°
              </span>
            </li>
          ))}
        </ul>
      )}
      <NumberField
        label="Latitude"
        unit="°, north +"
        value={site.latitudeDeg}
        min={-90}
        max={90}
        step={0.001}
        onChange={(latitudeDeg) =>
          setSite({
            ...site,
            latitudeDeg,
            name: site.name.endsWith("(edited)") ? site.name : `${site.name} (edited)`,
          })
        }
      />
      <NumberField
        label="Longitude"
        unit="°, east +"
        value={site.longitudeDeg}
        min={-180}
        max={180}
        step={0.001}
        onChange={(longitudeDeg) =>
          setSite({
            ...site,
            longitudeDeg,
            name: site.name.endsWith("(edited)") ? site.name : `${site.name} (edited)`,
          })
        }
      />
      <p className="hint small">
        Place search and weather: Open-Meteo.com (GeoNames, ERA5). The time zone follows the place
        picked.
      </p>
    </Section>
  );
}
