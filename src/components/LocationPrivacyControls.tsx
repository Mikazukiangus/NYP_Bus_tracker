import { useRef, useState } from 'react';
import { ActionButton } from './ActionButton';
import { locationExport } from '../features/location/locationExport';

export function LocationPrivacyControls({ onClear }: { onClear: () => Promise<boolean> }) {
  const summaryRef = useRef<HTMLElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
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
    pending.current = true; setBusy(true); setConfirming(false);
    try {
      const cleared = await onClear();
      setMessage(cleared ? 'Saved location and recent places cleared.' : 'Places were reset for this visit. Browser storage could not be fully cleared; clear this site’s data in browser settings.');
    } catch { setMessage('Could not clear saved places. Clear this site’s data in browser settings.'); }
    finally { pending.current = false; setBusy(false); summaryRef.current?.focus(); }
  };
  return <details className="border-t border-warm-200 pt-3 text-xs text-warm-600">
    <summary ref={summaryRef} className="cursor-pointer font-semibold text-helvetia">Your saved location data</summary>
    <p className="my-2">This browser remembers your selected location, last GPS fix and recent places until you clear them. Anyone using this browser profile can see them. Address searches are sent to OneMap.</p>
    <div className="flex flex-wrap gap-2">
      <ActionButton disabled={busy} onClick={download} className="rounded-lg border border-warm-300 bg-white px-3 py-2 text-helvetia font-semibold">Download location data</ActionButton>
      <ActionButton ref={clearRef} disabled={busy} onClick={() => setConfirming(true)} className="rounded-lg border border-warm-300 bg-white px-3 py-2 text-helvetia font-semibold">{busy ? 'Clearing…' : 'Clear location and recent places'}</ActionButton>
    </div>
    {confirming && <div className="mt-3 rounded-xl border border-warm-300 p-3">
      <p className="font-semibold text-warm-900">Clear your saved location and recent places?</p>
      <p className="mt-1">You can select them again afterwards. Your saved buses will stay available.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <ActionButton onClick={() => { setConfirming(false); clearRef.current?.focus(); }}>Cancel</ActionButton>
        <ActionButton tone="primary" onClick={() => void clear()}>Confirm clear</ActionButton>
      </div>
    </div>}
    <p role="status" className="mt-2">{message}</p>
  </details>;
}
