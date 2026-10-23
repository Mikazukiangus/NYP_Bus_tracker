export function PersistenceNotice({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
    Changes to {items.join(', ')} apply to this visit only. They may not be remembered after reloading.
  </p>;
}
