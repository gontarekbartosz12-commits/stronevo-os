'use client';

import CallsLiveBoard from '@/components/calls/CallsLiveBoard';

// Zakładka "Połączenia" na karcie klienta (widok CEO STRONEVO).
// RODO: numery dzwoniących maskowane — pełne widzi tylko właściciel firmy
// w swoim panelu (/klient).
export default function CallsTab({ contactId }: { contactId: string }) {
  return <CallsLiveBoard contactId={contactId} maskNumbers={true} />;
}
