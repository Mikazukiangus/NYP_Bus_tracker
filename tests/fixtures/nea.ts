// One valid envelope containing every shape used by the twelve NEA dataset parsers.
export function neaFixture() {
  const time = '2026-10-21T00:00:00Z';
  return { code: 0, data: {
    area_metadata: [{ name: 'Ang Mo Kio', label_location: { latitude: 1.38, longitude: 103.85 } }],
    items: [{ timestamp: time, update_timestamp: time, valid_period: { text: 'This afternoon' }, forecasts: [{ area: 'Ang Mo Kio', forecast: 'Fair' }],
      readings: { psi_twenty_four_hourly: {}, pm25_twenty_four_hourly: {}, pm10_twenty_four_hourly: {}, o3_eight_hour_max: {}, pm25_one_hourly: {} } }],
    stations: [], readingUnit: 'mm', readings: [{ timestamp: time, data: [] }], regionMetadata: [],
    records: [{ datetime: time, general: { validPeriod: { text: 'Today' }, forecast: { text: 'Fair' }, temperature: { low: 24, high: 32 },
      relativeHumidity: { low: 60, high: 95 }, wind: { direction: 'NE', speed: { low: 5, high: 15 } } }, periods: [], index: [{ hour: time, value: 0 }], item: { readings: [] }, forecasts: [] }],
  } };
}
