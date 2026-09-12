import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlace, restorePlace, countryCode} from '../site/place.js';

const catalog = {
  countries: [{code: 'WO'}, {code: 'DE'}, {code: 'ES'}],
  subdivisions: [{country: 'ES', code: 'ES-CT', name: 'Catalonia'}]
};
const label = code => ({WO: 'International', DE: 'Germany', ES: 'Spain'})[code];
const restore = input => restorePlace(input, catalog, label);

test('International has a canonical rollup while retaining legacy compatibility', () => {
  for (const country of ['WO', '001', 'INTL']) {
    const place = createPlace({country}, catalog, label);
    assert.deepEqual(place, {country: 'INTL', rollup: '001', label: 'International'});
    assert.equal(countryCode(place), 'WO');
  }
  assert.equal(restore({}).country, 'INTL');
});

test('legacy country preference migrates without requiring new storage', () => {
  assert.deepEqual(restore({storedCountry: 'DE'}), {country: 'DE', label: 'Germany'});
});

test('valid query overrides a saved region; country-only links clear region', () => {
  const storedPlace = JSON.stringify({country: 'ES', region: 'ES-CT', label: 'Old label'});
  assert.deepEqual(restore({queryCountry: 'DE', storedPlace}), {country: 'DE', label: 'Germany'});
  assert.deepEqual(restore({queryCountry: 'ES', storedPlace}), {country: 'ES', label: 'Spain'});
});

test('region keeps its own catalog label and cannot cross country boundaries', () => {
  assert.deepEqual(restore({queryCountry: 'ES', queryRegion: 'ES-CT'}), {country: 'ES', region: 'ES-CT', label: 'Catalonia'});
  assert.deepEqual(restore({queryCountry: 'DE', queryRegion: 'ES-CT'}), {country: 'DE', label: 'Germany'});
});

test('stored labels and additional properties never become trusted geography or permissions', () => {
  const storedPlace = JSON.stringify({country: 'ES', region: 'ES-CT', label: '<img onerror=alert(1)>', admin: true});
  assert.deepEqual(restore({storedPlace}), {country: 'ES', region: 'ES-CT', label: 'Catalonia'});
});

test('invalid query or malformed storage fall back to a valid saved country', () => {
  for (const storedPlace of ['{', 'null', '[]', '7', JSON.stringify({country: 'ZZ'})]) {
    assert.deepEqual(restore({queryCountry: 'ZZ', storedPlace, storedCountry: 'DE'}), {country: 'DE', label: 'Germany'});
  }
});
