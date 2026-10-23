import type { IncidentFeed } from './model';

export function IncidentFeedNotice({ feed }: { feed: IncidentFeed }) {
  if (feed.status === 'ready') return null;
  const time = feed.fetchedAt ? new Date(feed.fetchedAt).toLocaleTimeString('en-SG', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : null;
  return <p role="status" className="px-3 py-2 text-xs text-amber-900 bg-amber-50 border-b border-amber-200">
    {feed.status === 'loading' ? 'Checking traffic incidents…'
      : feed.status === 'unavailable' ? 'Traffic incident feed unavailable. Current conditions are unknown.'
        : `Traffic incidents may be out of date${time ? ` · last updated ${time} SGT` : ''}.`}
  </p>;
}
