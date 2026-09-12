// Public place preferences contain geography only. They confer no account privileges.
export const internationalPlace = 'INTL';

export function createPlace(input, catalog, countryLabel) {
  const code = typeof input?.country === 'string' ? input.country.toUpperCase() : '';
  if (['WO', '001', internationalPlace].includes(code)) {
    return {country: internationalPlace, rollup: '001', label: countryLabel('WO')};
  }
  if (!catalog.countries.some(country => country.code === code && code !== 'WO')) return null;
  const region = typeof input.region === 'string' ? input.region.toUpperCase() : '';
  const subdivision = catalog.subdivisions.find(item => item.code === region && item.country === code);
  return subdivision
    ? {country: code, region: subdivision.code, label: subdivision.name}
    : {country: code, label: countryLabel(code)};
}

export function restorePlace(input, catalog, countryLabel) {
  let stored;
  try { stored = JSON.parse(input.storedPlace || 'null'); } catch { stored = null; }
  const queryCountry = input.queryCountry || input.queryRegion?.split('-')[0];
  for (const candidate of [
    {country: queryCountry, region: input.queryRegion},
    stored,
    {country: input.storedCountry},
    {country: internationalPlace}
  ]) {
    const place = createPlace(candidate, catalog, countryLabel);
    if (place) return place;
  }
}

// WO remains a compatibility code in the existing country/language data and URLs.
export function countryCode(place) {
  return place.country === internationalPlace ? 'WO' : place.country;
}
