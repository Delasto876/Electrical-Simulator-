/**
 * COMPANY BRANDING — printed on every report (calculation sheet, BOM, single-line
 * diagram, checklist) and shown in the Reports tab. Change the details here;
 * replace the logo by overwriting src/assets/lumix-logo.png (any PNG, it is
 * scaled to fit a 30 mm box keeping its aspect ratio).
 *
 * Source: lumixtechjm.com (logo.png and the business details the site
 * publishes), fetched 2026-11-06.
 */
import logoUrl from "../assets/lumix-logo.png";

export const COMPANY = {
  name: "Lumix Technologies",
  tagline: "Solar installation · Battery backup · Smart home & security",
  website: "lumixtechjm.com",
  phone: "+1 876 212 7365",
  email: "Lumixtech876@gmail.com",
  address: "Junction, St. Elizabeth, Jamaica",
  logoUrl,
  /** Accent colour used for report headings (from the logo's leaf). */
  accentRgb: [122, 168, 54] as [number, number, number],
} as const;

/** Text under every report page. */
export const REPORT_DISCLAIMER =
  "Design aid only. Values marked unverified come from placeholder catalog data or code tables " +
  "recalled from memory (see VERIFY.md). A licensed electrician must check the design against the " +
  "adopted code and the manufacturers' datasheets before installation.";
