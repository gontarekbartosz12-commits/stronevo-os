'use server';

import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { Automation, ClientAutomation, Contact, TemplateVersion } from '@/lib/types';

// Rejestr wersji szablonów (Faza 1 zaufania) — „która wersja u którego klienta".
// client_automations.template_version = 'nazwa@wersja' (np. 'chatbot-rag@1.2.0').

export interface TemplateDeployment {
  caId: string;
  klient: string;
  automatyzacja: string;
  wersja: string | null; // wersja u klienta (z template_version)
  aktualna: boolean; // == najnowsza wersja szablonu
}

export interface TemplateGroup {
  nazwa: string;
  najnowsza: TemplateVersion;
  starsze: number; // ile starszych wersji w rejestrze
  deployments: TemplateDeployment[];
  doAktualizacji: number;
}

export interface TemplateRegistryData {
  groups: TemplateGroup[];
  bezWersji: TemplateDeployment[]; // wdrożenia bez przypisanej wersji szablonu
}

export async function getTemplateRegistry(): Promise<TemplateRegistryData> {
  let versions: TemplateVersion[];
  let cas: ClientAutomation[];
  let contacts: Contact[];
  let automations: Automation[];

  if (!isSupabaseConfigured()) {
    versions = demoStore.listTemplateVersions();
    cas = demoStore.listClientAutomations();
    contacts = demoStore.listContacts();
    automations = demoStore.listAutomations();
  } else {
    const supabase = await createClient();
    const [v, ca, c, a] = await Promise.all([
      supabase.from('template_versions').select('*').order('created_at', { ascending: false }),
      supabase.from('client_automations').select('*'),
      supabase.from('contacts').select('*').is('owner_contact_id', null),
      supabase.from('automations_catalog').select('*'),
    ]);
    versions = (v.data ?? []) as TemplateVersion[];
    cas = (ca.data ?? []) as ClientAutomation[];
    contacts = (c.data ?? []) as Contact[];
    automations = (a.data ?? []) as Automation[];
  }

  const klientName = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    return c ? c.firma ?? c.imie : '—';
  };
  const autoName = (id: string) =>
    automations.find((a) => a.id === id)?.nazwa ?? 'Automatyzacja';

  const toDeployment = (ca: ClientAutomation): TemplateDeployment & { szablon: string | null } => {
    const [nazwa, wersja] = (ca.template_version ?? '').split('@');
    return {
      caId: ca.id,
      klient: klientName(ca.contact_id),
      automatyzacja: autoName(ca.automation_id),
      wersja: wersja || null,
      szablon: nazwa || null,
      aktualna: false, // uzupełniane niżej per grupa
    };
  };

  const deployments = cas.map(toDeployment);

  // Grupy per nazwa szablonu — najnowsza wersja = pierwsza po created_at desc
  const byName = new Map<string, TemplateVersion[]>();
  for (const v of versions) {
    const list = byName.get(v.nazwa) ?? [];
    list.push(v);
    byName.set(v.nazwa, list);
  }

  const groups: TemplateGroup[] = [...byName.entries()].map(([nazwa, list]) => {
    const najnowsza = list[0];
    const own = deployments
      .filter((d) => d.szablon === nazwa)
      .map((d) => ({ ...d, aktualna: d.wersja === najnowsza.wersja }));
    return {
      nazwa,
      najnowsza,
      starsze: list.length - 1,
      deployments: own,
      doAktualizacji: own.filter((d) => !d.aktualna).length,
    };
  });

  return {
    groups: groups.sort((a, b) => b.doAktualizacji - a.doAktualizacji),
    bezWersji: deployments.filter((d) => !d.szablon),
  };
}
