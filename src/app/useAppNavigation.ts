import { useCallback, useState } from 'react';
import type { AppTab } from '../components/AppTabs';
export const ARRIVALS_CARD_ID = 'live-arrivals';

export function useAppNavigation() {
  const [activeTab, setActiveTab] = useState<AppTab>('arrivals');
  // Each tab opens at the top, as in an app; choosing the open tab again goes back to the top
  const selectTab = useCallback(
    (tab: AppTab) => {
      window.scrollTo({ top: 0, behavior: tab === activeTab ? 'smooth' : 'auto' });
      setActiveTab(tab);
    },
    [activeTab]
  );

  // A bus picked from the search, a nearby stop, the stop's other buses or the saved ones: bring its times into view
  // (on phones they're usually below the screen), so the tap visibly does something
  const revealArrivals = useCallback(() => {
    if (activeTab !== 'arrivals') return;
    setTimeout(() => {
      const card = document.getElementById(ARRIVALS_CARD_ID);
      if (!card) return;
      const top = card.getBoundingClientRect().top;
      if (top >= 0 && top <= window.innerHeight * 0.45) return; // already in view
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const startY = window.scrollY;
      card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      // A smooth scroll can be dropped (a page that isn't drawing frames never runs it): if the page hasn't moved,
      // go straight there (not if it has, so a scroll of the user's own isn't overridden)
      setTimeout(() => {
        if (window.scrollY === startY) card.scrollIntoView({ block: 'start' });
      }, 600);
    }, 50); // after the new bus renders
  }, [activeTab]);

  const showTripOnMap = useCallback(() => {
    setActiveTab('map');
    // After the map tab renders
    setTimeout(() => document.getElementById('trip-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  // The next-bus bar on phones opens the full arrivals card, which is on the Arrivals tab
  const showArrivalsCard = () => {
    const scroll = () => document.getElementById(ARRIVALS_CARD_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (activeTab === 'arrivals') return scroll();
    selectTab('arrivals');
    setTimeout(scroll, 50); // after the tab renders
  };

  return { activeTab, selectTab, revealArrivals, showTripOnMap, showArrivalsCard };
}
