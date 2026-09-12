import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function buildPlaceData(sourceDir, countries) {
  const vendor = path.join(sourceDir, 'vendor');
  const manifest = JSON.parse(await readFile(path.join(vendor, 'place-sources.json'), 'utf8'));
  const source = await readFile(path.join(vendor, 'ne_110m_admin_0_countries.geojson'));
  const divisions = await readFile(path.join(vendor, 'iso_3166-2.json'));
  for (const [bytes, expected] of [[source, manifest.map.sha256], [divisions, manifest.subdivisions.sha256]]) {
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Place source digest mismatch');
  }
  const valid = new Set(countries.map(country => country.code));
  const subdivisions = JSON.parse(divisions)['3166-2'].map(item => ({
    code: item.code, country: item.code.split('-')[0], name: item.name
  })).filter(item => valid.has(item.country));
  const regionCodes = new Set();
  for (const item of subdivisions) {
    if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(item.code) || !item.name || regionCodes.has(item.code))
      throw new Error('Invalid subdivision: ' + item.code);
    regionCodes.add(item.code);
  }
  const features = JSON.parse(source).features.map(feature => {
    const props = feature.properties;
    const code = [props.ISO_A2_EH, props.ISO_A2].find(value => valid.has(value));
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    // Equirectangular overview; source rings already split at the antimeridian.
    const d = polygons.map(polygon => polygon.map(ring => ring.map(([longitude, latitude], index) =>
      (index ? 'L' : 'M') + ((longitude + 180) * 2).toFixed(2) + ',' + ((90 - latitude) * 2).toFixed(2)
    ).join('') + 'Z').join('')).join('');
    return {code: code || null, d};
  });
  return {subdivisions, map: {viewBox: '0 0 720 360', features}, sources: manifest};
}
