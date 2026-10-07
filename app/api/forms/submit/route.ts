import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/demo-store';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase/admin';
import { FormDef } from '@/lib/types';

// POST /api/forms/submit — publiczny submit formularza ze strony /s/[slug]
// lub embedu (Faza 3). RODO twarde: bez zgody NIE zapisujemy. Po zapisie:
// lead w CRM właściciela (owner_contact_id) + notyfikacja + trigger n8n
// (forms.webhook_url — konfiguracja OPERATORA, klient jej nie widzi).
// Body: { form_id, dane: {..}, zgoda_rodo: true }

export async function POST(request: NextRequest) {
  let body: { form_id?: string; dane?: Record<string, unknown>; zgoda_rodo?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body musi być JSON-em' }, { status: 400 });
  }

  if (!body.form_id) return NextResponse.json({ error: 'Podaj form_id' }, { status: 400 });
  if (body.zgoda_rodo !== true) {
    return NextResponse.json(
      { error: 'Wymagana zgoda na przetwarzanie danych (RODO).' },
      { status: 400 }
    );
  }
  const dane = body.dane ?? {};
  if (Object.values(dane).every((v) => !String(v ?? '').trim())) {
    return NextResponse.json({ error: 'Formularz jest pusty' }, { status: 400 });
  }

  try {
    const demo = !isSupabaseConfigured();
    let form: FormDef | null;
    if (demo) {
      form = demoStore.getForm(body.form_id);
    } else {
      if (!isAdminConfigured()) {
        return NextResponse.json({ error: 'Brak service role' }, { status: 503 });
      }
      const { data } = await createAdminClient()
        .from('forms')
        .select('*')
        .eq('id', body.form_id)
        .maybeSingle();
      form = data as FormDef | null;
    }
    if (!form) return NextResponse.json({ error: 'Formularz nie istnieje' }, { status: 404 });

    const str = (k: string) => String(dane[k] ?? '').trim().slice(0, 300) || null;
    const imie = str('imie') ?? str('nazwa') ?? 'Zgłoszenie z formularza';

    // Lead do CRM właściciela formularza (multi-tenant: owner_contact_id)
    const leadRow = {
      server_id: null,
      typ: 'lead' as const,
      imie,
      firma: str('firma'),
      nip: null,
      adres: null,
      branza: null,
      miasto: null,
      telefon: str('telefon') ?? str('tel'),
      email: str('email'),
      zrodlo: `formularz: ${form.nazwa}`,
      status_pipeline: 'NOWY' as const,
      nastepna_akcja: 'Oddzwonić — zgłoszenie z formularza WWW',
      nastepna_akcja_data: new Date().toISOString().slice(0, 10),
      data_ostatniego_kontaktu: null,
      notatki: `Dane z formularza: ${JSON.stringify(dane).slice(0, 500)} · zgoda RODO: TAK`,
      business_hours: null,
      srednia_wartosc_wizyty: null,
      auto_followup_sms: false,
      przypisany_do: null,
      owner_contact_id: form.contact_id,
    };

    let leadId: string | null = null;
    let submissionId: string;
    if (demo) {
      leadId = demoStore.createContact(leadRow).id;
      submissionId = demoStore.createFormSubmission({
        form_id: form.id,
        contact_id: form.contact_id,
        dane,
        zgoda_rodo: true,
        lead_id: leadId,
      }).id;
      demoStore.createNotification({
        typ: 'biznes',
        severity: 'info',
        tytul: `Nowe zgłoszenie z formularza: ${form.nazwa}`,
        opis: `${imie}${leadRow.telefon ? ` · ${leadRow.telefon}` : ''} — lead zapisany w CRM.`,
        related_typ: 'contact',
        related_id: leadId,
        status: 'nowe',
        akcje: [],
      });
    } else {
      const supabase = createAdminClient();
      const { data: lead } = await supabase.from('contacts').insert(leadRow).select('id').single();
      leadId = (lead?.id as string) ?? null;
      const { data: sub, error } = await supabase
        .from('form_submissions')
        .insert({
          form_id: form.id,
          contact_id: form.contact_id,
          dane,
          zgoda_rodo: true,
          lead_id: leadId,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      submissionId = sub.id;
      await supabase.from('notifications').insert({
        typ: 'biznes',
        severity: 'info',
        tytul: `Nowe zgłoszenie z formularza: ${form.nazwa}`,
        opis: `${imie}${leadRow.telefon ? ` · ${leadRow.telefon}` : ''} — lead zapisany w CRM.`,
        related_typ: 'contact',
        related_id: leadId,
        status: 'nowe',
        akcje: [],
      });
    }

    // Trigger n8n (automatyzacja OPERATORA — np. SMS-podziękowanie, sekwencja)
    if (form.webhook_url) {
      try {
        await fetch(form.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ form_id: form.id, submission_id: submissionId, dane, lead_id: leadId }),
        });
      } catch {
        // webhook nie może blokować submitu
      }
    }

    return NextResponse.json({ ok: true, submission_id: submissionId, lead_id: leadId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Błąd zapisu zgłoszenia' },
      { status: 500 }
    );
  }
}
