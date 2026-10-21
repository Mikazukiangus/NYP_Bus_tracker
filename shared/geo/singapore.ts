export function isSingaporeLocation(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 1.15 && lat <= 1.48 && lng >= 103.55 && lng <= 104.1;
}
