import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCATION_STORAGE_KEY, loadSavedLocation, locationFromGps, saveUserLocation } from '../src/services/userLocation';

const orchard = { name: 'Orchard Rd', lat: 1.3018, lng: 103.8362, isSimulated: true };

test('restores the saved preset and the last GPS fix', () => {
  for (const loc of [orchard, locationFromGps({ latitude: 1.3698, longitude: 103.8496, accuracy: 12.4 })!]) {
    let saved: string | null = null;
    saveUserLocation(loc, { setItem(key, value) { assert.equal(key, LOCATION_STORAGE_KEY); saved = value; } });
    assert.deepEqual(loadSavedLocation({ getItem() { return saved; } }), loc);
  }
});

test('ignores corrupt, incomplete and out-of-Singapore saved locations', () => {
  for (const raw of [null, '{', 'null', JSON.stringify({ ...orchard, lat: '1.3' }),
    JSON.stringify({ ...orchard, name: '' }), JSON.stringify({ ...orchard, lng: 0 }),
    JSON.stringify({ ...orchard, isSimulated: undefined }), JSON.stringify({ ...orchard, accuracyMeters: -1 })]) {
    assert.equal(loadSavedLocation({ getItem() { return raw; } }), null);
  }
});

test('blocked browser storage does not break location changes', () => {
  assert.equal(loadSavedLocation({ getItem() { throw new Error('blocked'); } }), null);
  assert.doesNotThrow(() => saveUserLocation(orchard, { setItem() { throw new Error('full'); } }));
});

test('GPS fixes must be in Singapore, with usable accuracy retained', () => {
  assert.equal(locationFromGps({ latitude: NaN, longitude: 103.8, accuracy: 10 }), null);
  assert.equal(locationFromGps({ latitude: 51.5, longitude: -0.1, accuracy: 10 }), null);
  assert.deepEqual(locationFromGps({ latitude: 1.3698, longitude: 103.8496, accuracy: 12.4 }), {
    name: 'My Device GPS Location', lat: 1.3698, lng: 103.8496, isSimulated: false, accuracyMeters: 12,
  });
});
