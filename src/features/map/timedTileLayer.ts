import L from 'leaflet';
import { boundImageRequest } from './imageDeadline';

export class TimedTileLayer extends L.TileLayer {
  private pending = new Map<HTMLImageElement, () => void>();
  constructor(url: string, options: L.TileLayerOptions, private timeoutMs: number) {
    super(url, options);
    this.on('tileunload', event => {
      const tile = event.tile as HTMLImageElement;
      this.pending.get(tile)?.();
      this.pending.delete(tile);
    });
  }
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.alt = '';
    if (this.options.crossOrigin !== undefined && this.options.crossOrigin !== false) tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
    if (typeof this.options.referrerPolicy === 'string') tile.referrerPolicy = this.options.referrerPolicy;
    const cancel = boundImageRequest(tile, this.timeoutMs, error => {
      this.pending.delete(tile);
      done(error, tile);
    });
    this.pending.set(tile, cancel);
    tile.src = this.getTileUrl(coords);
    return tile;
  }
  onRemove(map: L.Map): this {
    for (const cancel of this.pending.values()) cancel();
    this.pending.clear();
    return super.onRemove(map);
  }
}
