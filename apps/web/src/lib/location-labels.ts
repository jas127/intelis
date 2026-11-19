export interface LocationLabelInput {
  dominant_postcode?: string | null;
  dominant_locality?: string | null;
  h3_index?: string;
}

/**
 * Primary human-readable location label for an H3 cell.
 * Uses verified postcode information when available; otherwise returns
 * a neutral fallback rather than exposing a raw H3 hash as a title.
 */
export function formatZonePrimaryLabel(zone: LocationLabelInput): string {
  const pc = zone.dominant_postcode?.trim();
  if (pc) {
    return `Postcode area ${pc}`;
  }
  return "Unnamed candidate area";
}

/**
 * Secondary real locality label (only when reliable non-generic locality
 * data exists in Overture, e.g. "Secunderabad"). Never invents names.
 */
export function formatZoneSecondaryLabel(
  zone: LocationLabelInput
): string | null {
  const loc = zone.dominant_locality?.trim();
  if (!loc) return null;
  return loc;
}

/**
 * Sequential shortlist badge label ("Candidate 01", "Candidate 02", ...).
 */
export function formatCandidateLabel(rank: number | null | undefined): string {
  if (!rank || rank < 1) return "Candidate";
  return `Candidate ${String(rank).padStart(2, "0")}`;
}

/**
 * Composite display title for candidate cards combining sequential candidate rank,
 * primary postcode label, and disambiguation if provided.
 */
export function formatCandidateAreaTitle(
  zone: LocationLabelInput,
  rank?: number | null,
  disambiguation?: string | null
): string {
  const pc = zone.dominant_postcode?.trim();
  const areaPart = pc ? `Postcode area ${pc}` : "Candidate area";
  const dis = disambiguation ? ` (${disambiguation})` : "";
  if (rank && rank > 0) {
    return `Candidate ${String(rank).padStart(2, "0")} · ${areaPart}${dis}`;
  }
  return `${areaPart}${dis}`;
}

/**
 * Build disambiguated display labels for a list of zones (e.g. Compare or charts)
 * so two distinct H3 cells in the same postcode show "Postcode area 500033 (Area A)"
 * and "Postcode area 500033 (Area B)" instead of exposing raw H3 hashes.
 */
export function buildDisambiguatedZoneLabels(
  zones: LocationLabelInput[],
  compact = false
): Map<string, string> {
  const baseLabel = (z: LocationLabelInput) => {
    const pc = z.dominant_postcode?.trim();
    if (pc) return compact ? `Postcode ${pc}` : `Postcode area ${pc}`;
    return compact ? "Unnamed area" : "Unnamed candidate area";
  };

  const counts = new Map<string, number>();
  for (const z of zones) {
    const label = baseLabel(z);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const result = new Map<string, string>();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (const z of zones) {
    const key = z.h3_index ?? "";
    const label = baseLabel(z);
    if ((counts.get(label) ?? 0) > 1) {
      const idx = seen.get(label) ?? 0;
      seen.set(label, idx + 1);
      const suffix = letters[idx] ?? String(idx + 1);
      result.set(key, `${label} (Area ${suffix})`);
    } else {
      result.set(key, label);
    }
  }

  return result;
}
