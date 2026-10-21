// The bus number last looked up in "Find Bus Service", so the app opens on it next time instead of a fixed default
const LAST_BUS_SEARCH_KEY = 'sbs_last_bus_search_v1';

// Bus service numbers: up to six letters/digits, matching the API (72, 72A, 960e, NR1, CT18, BPS1).
const SERVICE_NO = /^[A-Z0-9]{1,6}$/;

export function loadLastBusSearch(storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    const saved = (storage ?? window.localStorage).getItem(LAST_BUS_SEARCH_KEY)?.trim().toUpperCase();
    return saved && SERVICE_NO.test(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function saveLastBusSearch(serviceNo: string, storage?: Pick<Storage, 'setItem'>) {
  if (typeof serviceNo !== 'string') return;
  const clean = serviceNo.trim().toUpperCase();
  if (!SERVICE_NO.test(clean)) return;
  try {
    (storage ?? window.localStorage).setItem(LAST_BUS_SEARCH_KEY, clean);
  } catch {
    // Private browsing or storage full: it just isn't remembered
  }
}
