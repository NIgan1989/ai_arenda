import { useEffect, useRef, useState } from 'react';
import { request } from './api';
import { freshDraft, matchingBody, type GuestDraft } from './ai-request';
import { countDraft, formCount, type FormCount } from './form-count';

// While the form is open, the count under it follows the conditions: a moment after the last change the same public
// search the button runs is asked once more, without the class (form-count.ts). The class is applied on the phone, so
// choosing one counts again at once. An answer that came late is dropped; a failed one leaves the plain button.
export function useFormCount(draft: GuestDraft, on: boolean): FormCount | null {
  const [found, setFound] = useState<{ body: string; properties: any[] } | null>(null), seq = useRef(0);
  const body = on ? JSON.stringify(matchingBody(countDraft(freshDraft(draft)))) : '';
  useEffect(() => {
    if (!body) return;
    const at = ++seq.current;
    const timer = setTimeout(() => {
      request('/api/public/matching?q=' + encodeURIComponent(body))
        .then((result: any) => { if (at === seq.current) setFound({ body, properties: result?.properties || [] }); })
        .catch(() => { if (at === seq.current) setFound(null); });
    }, 600);
    return () => clearTimeout(timer);
  }, [body]);
  return on && found && found.body === body ? formCount(draft, found.properties) : null;
}
