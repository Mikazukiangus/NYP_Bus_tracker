import { useCallback, useEffect, useRef, useState } from 'react';
import type { WeatherSnapshot } from '../../types/weather';
import { config } from '../../config';
import { fetchWeatherSnapshot } from './client';

export function useWeatherSnapshot() {
  // NEA weather: one Singapore-wide snapshot, summarised for wherever the user is
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const weatherRetries = useRef(0);

  const loadWeather = useCallback(async () => {
    setIsWeatherLoading(true);
    try {
      setWeatherSnapshot(await fetchWeatherSnapshot());
      setWeatherError(false);
    } catch {
      setWeatherError(true);
    } finally {
      setIsWeatherLoading(false);
    }
  }, []);

  // Refresh at the configured interval (default 5 minutes; NEA updates readings every 1-5 min).
  useEffect(() => {
    loadWeather();
    const timer = setInterval(loadWeather, config.polling.weatherSeconds * 1000);
    return () => clearInterval(timer);
  }, [loadWeather]);

  // A cold API instance fetches datasets in batches to respect data.gov.sg's rate limit,
  // so if some are still missing, ask again shortly to fill the gaps
  useEffect(() => {
    if (!weatherSnapshot?.missing.length) {
      weatherRetries.current = 0;
      return;
    }
    if (weatherRetries.current >= config.polling.weatherRetryAttempts) return;
    const timer = setTimeout(() => {
      weatherRetries.current += 1;
      loadWeather();
    }, config.polling.weatherRetryMs);
    return () => clearTimeout(timer);
  }, [weatherSnapshot, loadWeather]);

  return { weatherSnapshot, isWeatherLoading, weatherError, loadWeather };
}
