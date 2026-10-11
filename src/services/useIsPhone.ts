import { useEffect, useState } from 'react';

// Phone widths: below Tailwind's sm breakpoint (40rem = 640px), where the cards stack in one column
const PHONE_QUERY = '(max-width: 639.98px)';

const matches = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;

// True on phone-width screens; follows rotation and window resizes
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(matches);

  useEffect(() => {
    const query = window.matchMedia?.(PHONE_QUERY);
    if (!query) return;
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isPhone;
}
