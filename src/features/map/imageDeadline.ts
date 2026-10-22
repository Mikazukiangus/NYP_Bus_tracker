// Replacing a stalled image with a local blank stops waiting without a fallback network request.
const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
export function boundImageRequest(image: HTMLImageElement, timeoutMs: number, done: (error?: Error) => void = () => {}) {
  let finished = false;
  const clean = () => {
    clearTimeout(timer);
    image.removeEventListener('load', loaded);
    image.removeEventListener('error', failed);
  };
  const finish = (error?: Error) => {
    if (finished) return;
    finished = true;
    clean();
    if (error) image.src = EMPTY_IMAGE;
    done(error);
  };
  const loaded = () => finish();
  const failed = () => finish(new Error('Map image unavailable.'));
  const timer = setTimeout(() => finish(new Error('Map image timed out.')), timeoutMs);
  image.addEventListener('load', loaded);
  image.addEventListener('error', failed);
  if (image.hasAttribute('src') && image.complete) queueMicrotask(() => image.naturalWidth ? loaded() : failed());
  return () => {
    if (finished) return;
    finished = true;
    clean();
    image.src = EMPTY_IMAGE;
  };
}
