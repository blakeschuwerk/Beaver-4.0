import locationsByState from '../data/us_locations.json';

export interface ParsedUSCounty {
  name: string;
  state: string;
  label: string;
}

let countySet: Set<string> | undefined;
let countyList: string[] | undefined;

function loadCounties(): string[] {
  if (countyList) return countyList;

  const byState = locationsByState as Record<string, string[]>;

  countyList = Object.values(byState)
    .flat()
    .sort((a, b) => a.localeCompare(b));
  countySet = new Set(countyList);
  return countyList;
}

export function flattenUSCounties(): string[] {
  return [...loadCounties()];
}

export function isValidUSCounty(label: string): boolean {
  loadCounties();
  return countySet!.has(label.trim());
}

export function parseUSCountyLabel(label: string): ParsedUSCounty | null {
  const trimmed = label.trim();
  const match = trimmed.match(/^(.+),\s*([A-Z]{2})$/);
  if (!match) return null;
  return {
    name: match[1].trim(),
    state: match[2],
    label: trimmed,
  };
}

function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ');
}

export function searchUSCounties(query: string, limit = 8): string[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [];

  const all = loadCounties();
  const prefix: string[] = [];
  const substring: string[] = [];

  for (const county of all) {
    const normalized = normalizeForSearch(county);
    if (normalized.startsWith(q)) {
      prefix.push(county);
    } else if (normalized.includes(q)) {
      substring.push(county);
    }
    if (prefix.length + substring.length >= limit * 2) break;
  }

  return [...prefix, ...substring].slice(0, limit);
}

function normalizeCountyName(value: string): string {
  return value.toLowerCase().replace(/\s+county$/i, '').replace(/\s+/g, ' ').trim();
}

/**
 * Returns true if any user geography entry matches a pipeline county.
 * Supports legacy county_id/state entries and canonical "Name, ST" labels.
 */
export function geographyMatchesCounty(
  userGeography: string[],
  countyId: string,
  countyName: string,
  state: string,
): boolean {
  const countyIdLower = countyId.toLowerCase();
  const stateLower = state.toLowerCase();
  const nameNorm = normalizeCountyName(countyName);

  return userGeography.some((geo) => {
    const geoLower = geo.toLowerCase().trim();
    if (!geoLower) return false;

    if (geoLower === countyIdLower) return true;
    if (geoLower === stateLower) return true;

    const parsed = parseUSCountyLabel(geo);
    if (parsed) {
      if (parsed.state.toLowerCase() !== stateLower) return false;
      return normalizeCountyName(parsed.name) === nameNorm;
    }

    return normalizeCountyName(geo) === nameNorm;
  });
}

export function countyLabelMatchesFilter(
  filterCounty: string,
  countyId: string,
  countyName: string,
  state: string,
): boolean {
  if (filterCounty === 'all') return true;

  const filterLower = filterCounty.toLowerCase();
  if (filterLower === countyId.toLowerCase()) return true;
  if (filterLower === countyName.toLowerCase()) return true;
  if (filterCounty === `${countyName}, ${state}`) return true;

  const parsed = parseUSCountyLabel(filterCounty);
  if (parsed) {
    return (
      parsed.state.toLowerCase() === state.toLowerCase() &&
      normalizeCountyName(parsed.name) === normalizeCountyName(countyName)
    );
  }

  return countyId.toLowerCase().includes(filterLower) || countyName.toLowerCase().includes(filterLower);
}
