import { config, dataUrl } from '../../../config';
import { parseNetwork } from '../../../../shared/transit/parsers';
import type { BusNetwork } from '../model';
import { buildBusNetwork } from '../domain/buildNetwork';
import { fetchReadWithBackoff } from '../../../../shared/http/readRetry';

export function createNetworkRepository(settings: { url: string; timeoutMs: number }, request: typeof fetch = (...args) => fetch(...args)) {
  let pending: Promise<BusNetwork | null> | null = null;
  function load(): Promise<BusNetwork | null> {
    pending ??= fetchReadWithBackoff(request, settings.url, { signal: AbortSignal.timeout(settings.timeoutMs) }, config.retry)
      .then(async (res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
        const file = parseNetwork(await res.json());
        return file ? buildBusNetwork(file) : null;
      })
      .catch(() => null)
      .then((network) => {
        if (!network) pending = null;
        return network;
      });
    return pending;
  }
  return { load };
}
// One shared owner for all browser consumers; failed loads remain retryable.
export const networkRepository = createNetworkRepository({ url: dataUrl('/bus-routes/network.json'), timeoutMs: config.timeouts.networkMs });
