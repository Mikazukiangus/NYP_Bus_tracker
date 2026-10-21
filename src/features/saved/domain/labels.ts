import type { FavoriteItem } from '../../../types/bus';
import type { BusNetwork } from '../../network/model';
import { serviceDirectionKey } from '../../network/model';
export function favoriteLabels(items: FavoriteItem[], network: BusNetwork | null): FavoriteItem[] {
  if (!network) return items;
  return items.map(item => {
    const stop = network.byCode.get(item.stopCode);
    const pattern = network.byServiceDirection.get(serviceDirectionKey(item.serviceNo, item.direction));
    const destination = pattern ? network.stops[pattern.stops[pattern.stops.length - 1]].name : item.labelSnapshot?.destination ?? item.destination;
    return { ...item, stopName: stop?.name ?? item.labelSnapshot?.stopName ?? item.stopName,
      roadName: stop?.road ?? item.labelSnapshot?.roadName ?? item.roadName, destination };
  });
}
