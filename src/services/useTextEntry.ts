import { useEffect, useState } from 'react';

const TEXT_FIELD = 'input:not([type]), input[type=text], input[type=search], input[type=number], textarea';

const typing = () => !!document.activeElement?.matches(TEXT_FIELD);

// True while a text field has focus. On phones the on-screen keyboard is then up, so bars pinned to the
// bottom of the screen step aside instead of covering the suggestions under the field.
export function useTextEntry(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = () => setActive(typing());
    // On focusout the next field (if any) isn't focused yet, so check once it is
    const updateLater = () => requestAnimationFrame(update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', updateLater);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', updateLater);
    };
  }, []);

  return active;
}
