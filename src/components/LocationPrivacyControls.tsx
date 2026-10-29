import { useRef, useState } from 'react';
import { locationExport } from '../features/location/locationExport';

export function LocationPrivacyControls({ onClear }: { onClear: () => Promise<boolean> }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(locationExport(), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'bustrackersg-locations.json';
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      link.click();
      setMessage('Your download contains saved addresses and coordinates. Keep it private.');
    } catch { setMessage('Could not read saved places. Check your browser storage settings.'); }
  };
  const clear = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const cleared = await onClear();
      setMessage(cleared ? 'Saved location and recent places cleared.' : 'Places were reset for this visit. Browser storage could not be fully cleared; clear this site’s data in browser settings.');
    } catch { setMessage('Could not clear saved places. Clear this site’s data in browser settings.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <details className="border-t border-warm-200 pt-3 text-xs text-warm-600">
    <summary className="cursor-pointer font-semibold text-helvetia">Your saved location data</summary>
    <p className="my-2">This browser remembers your selected location, last GPS fix and recent places until you clear them. Anyone using this browser profile can see them. Address searches are sent to OneMap.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={download} className="rounded-lg border border-warm-300 bg-white px-3 py-2 text-helvetia font-semibold">Download location data</button>
      <button type="button" disabled={busy} onClick={() => void clear()} className="rounded-lg border border-warm-300 bg-white px-3 py-2 text-helvetia font-semibold">{busy ? 'Clearing…' : 'Clear location and recent places'}</button>
    </div>
    <p role="status" className="mt-2">{message}</p>
  </details>;
}
