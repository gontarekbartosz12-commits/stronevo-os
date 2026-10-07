'use server';

import { revalidatePath } from 'next/cache';
import { demoStore } from '@/lib/demo-store';
import { getN8nWorkflows } from '@/lib/integrations/n8n';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import {
  ActivityPoint,
  Contact,
  Invoice,
  Server,
  ServerInput,
  ServerOverview,
} from '@/lib/types';

export async function createServer(input: {
  nazwa: string;
  host: string | null;
  port: number | null;
  notatka: string | null;
  n8n_url: string | null;
  n8n_api_key: string | null;
}): Promise<Server> {
  const row: ServerInput = { ...input, status: 'aktywny' };

  let created: Server;
  if (!isSupabaseConfigured()) {
    created = demoStore.createServer(row);
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from('servers').insert(row).select().single();
    if (error) throw new Error(`Nie udało się dodać serwera: ${error.message}`);
    created = data as Server;
  }
  revalidatePath('/serwery');
  return created;
}

// Deterministyczny mock aktywności workflowów (wykonania/dzień, 14 dni) —
// stabilny między renderami, zróżnicowany per serwer. Live: do zastąpienia
// agregacją z n8n /executions przy deployu.
function mockActivity(serverId: string, days = 14): ActivityPoint[] {
  const seed = [...serverId].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const points: ActivityPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const wave = Math.abs(Math.sin(seed + i * 1.7));
    const weekend = d.getDay() === 0 || d.getDay() === 6 ? 0.4 : 1;
    points.push({
      data: d.toISOString().slice(0, 10),
      wykonania: Math.round((8 + wave * 30) * weekend),
    });
  }
  return points;
}

// Pełny kontekst serwera: workflowy jego instancji n8n, przypięte
// kontakty (prospekci/klienci), ich faktury i aktywność w czasie.
export async function getServerOverview(serverId: string): Promise<ServerOverview> {
  let server: Server | null;
  let kontakty: Contact[];
  let faktury: Invoice[];

  if (!isSupabaseConfigured()) {
    server = demoStore.getServer(serverId);
    kontakty = demoStore.listContacts().filter((c) => c.server_id === serverId);
    const kontaktIds = new Set(kontakty.map((c) => c.id));
    faktury = demoStore.listInvoices().filter((i) => kontaktIds.has(i.contact_id));
  } else {
    const supabase = await createClient();
    const { data: srv } = await supabase.from('servers').select('*').eq('id', serverId).maybeSingle();
    server = srv as Server | null;
    const { data: cons } = await supabase.from('contacts').select('*').eq('server_id', serverId);
    kontakty = (cons ?? []) as Contact[];
    const ids = kontakty.map((c) => c.id);
    if (ids.length > 0) {
      const { data: invs } = await supabase.from('invoices').select('*').in('contact_id', ids);
      faktury = (invs ?? []) as Invoice[];
    } else {
      faktury = [];
    }
  }

  if (!server) throw new Error('Serwer nie istnieje.');

  const workflows = await getN8nWorkflows(server);

  return {
    server,
    workflows,
    kontakty,
    faktury,
    aktywnosc: mockActivity(serverId),
  };
}
