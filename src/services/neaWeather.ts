import { NEAWeather } from '../types/bus';

interface NEAAreaMetadata {
  name: string;
  label_location: {
    latitude: number;
    longitude: number;
  };
}

interface NEAForecastItem {
  area: string;
  forecast: string;
}

interface NEAResponse {
  code: number;
  data: {
    area_metadata: NEAAreaMetadata[];
    items: {
      update_timestamp: string;
      timestamp: string;
      valid_period: {
        start: string;
        end: string;
        text: string;
      };
      forecasts: NEAForecastItem[];
    }[];
  };
}

// Find closest NEA official area by calculating distance
function findClosestNEAArea(
  userLat: number,
  userLng: number,
  areas: NEAAreaMetadata[]
): NEAAreaMetadata | null {
  if (!areas || areas.length === 0) return null;

  let closest: NEAAreaMetadata = areas[0];
  let minDistance = Infinity;

  for (const area of areas) {
    const lat = area.label_location?.latitude;
    const lng = area.label_location?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      const dist = Math.hypot(lat - userLat, lng - userLng);
      if (dist < minDistance) {
        minDistance = dist;
        closest = area;
      }
    }
  }

  return closest;
}

function getRegionForArea(areaName: string): NEAWeather['region'] {
  const north = ['Ang Mo Kio', 'Woodlands', 'Yishun', 'Sembawang', 'Mandai', 'Seletar', 'Sungei Kadut', 'Lim Chu Kang'];
  const east = ['Bedok', 'Tampines', 'Pasir Ris', 'Changi', 'Paya Lebar', 'Pulau Ubin', 'Pulau Tekong'];
  const west = ['Clementi', 'Jurong East', 'Jurong West', 'Boon Lay', 'Pioneer', 'Tuas', 'Bukit Batok', 'Choa Chu Kang', 'Bukit Panjang', 'Tengah', 'Western Water Catchment'];
  const south = ['Sentosa', 'Southern Islands', 'Bukit Merah', 'Queenstown', 'City'];

  if (north.includes(areaName)) return 'North';
  if (east.includes(areaName)) return 'East';
  if (west.includes(areaName)) return 'West';
  if (south.includes(areaName)) return 'South';
  return 'Central';
}

function parseForecastToWeather(
  forecastText: string,
  areaName: string,
  validPeriodText?: string,
  updateTimestamp?: string
): NEAWeather {
  const lower = forecastText.toLowerCase();
  const isRaining = lower.includes('shower') || lower.includes('rain') || lower.includes('thunder');

  let iconType: NEAWeather['iconType'] = 'cloudy';
  let rainProb = 15;
  let temp = 31;
  let humidity = 75;

  if (lower.includes('thunder')) {
    iconType = 'thunder';
    rainProb = 90;
    temp = 26;
    humidity = 92;
  } else if (lower.includes('heavy')) {
    iconType = 'heavy-rain';
    rainProb = 85;
    temp = 27;
    humidity = 90;
  } else if (lower.includes('shower') || lower.includes('rain')) {
    iconType = 'rain';
    rainProb = 70;
    temp = 28;
    humidity = 86;
  } else if (lower.includes('fair') || lower.includes('sunny')) {
    iconType = 'fair';
    rainProb = 10;
    temp = 32;
    humidity = 68;
  } else {
    // Cloudy / Partly cloudy
    iconType = 'cloudy';
    rainProb = 25;
    temp = 31;
    humidity = 74;
  }

  // Format Singapore Time from timestamp or now
  const updateDate = updateTimestamp ? new Date(updateTimestamp) : new Date();
  const timeFormatted = updateDate.toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const periodLabel = validPeriodText ? ` (${validPeriodText})` : '';

  return {
    area: areaName,
    region: getRegionForArea(areaName),
    forecast: forecastText,
    temperatureC: temp,
    humidityPercent: humidity,
    rainProbabilityPercent: rainProb,
    isRaining,
    windSpeedKmh: isRaining ? 24 : 14,
    updateTime: `NEA 2-Hr Forecast: ${timeFormatted} SGT${periodLabel}`,
    iconType,
    commuterAdvice: isRaining
      ? `Showers detected around ${areaName}. Carry an umbrella and use sheltered bus stop bays.`
      : `Good commuting weather around ${areaName}. Clear walking conditions to your bus stop.`,
  };
}

export async function fetchNEAWeatherData(userLat: number, userLng: number): Promise<NEAWeather> {
  // Strategy: Try /api/weather proxy first, fallback to direct keyless endpoint
  const urls = [
    '/api/weather',
    'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast',
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json: NEAResponse = await res.json();
        const areaMetadata = json?.data?.area_metadata || [];
        const item = json?.data?.items?.[0];
        const forecasts = item?.forecasts || [];

        if (forecasts.length > 0) {
          // Find closest NEA area to user's coordinates
          const closestArea = findClosestNEAArea(userLat, userLng, areaMetadata);
          const areaName = closestArea?.name || 'Ang Mo Kio';

          // Look up matching forecast for this area
          const matched = forecasts.find(
            (f) => f.area.toLowerCase() === areaName.toLowerCase()
          ) || forecasts[0];

          return parseForecastToWeather(
            matched.forecast,
            areaName,
            item?.valid_period?.text,
            item?.update_timestamp
          );
        }
      }
    } catch {
      // Try next url
    }
  }

  // Graceful fallback if offline
  return parseForecastToWeather('Partly Cloudy (Day)', 'Ang Mo Kio');
}
