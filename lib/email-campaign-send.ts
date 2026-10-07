import { demoStore } from './demo-store';
import { sendMarketingEmail } from './integrations/brevo';
import { newTrackingToken, renderCampaignHtml } from './marketing';
import { isSupabaseConfigured } from './supabase/config';
import { createAdminClient, isAdminConfigured } from './supabase/admin';
import { EmailCampaign, EmailContact } from './types';

// Wysyłka kampanii e-mail (Faza 3) — wspólna logika dla /api/email/send
// (cron/n8n) i akcji panelu. RODO twarde: tylko zgoda=true i opt_out=false;
// każdy mail: 1-klik wypis + tracking open/click (email_sends per odbiorca).
// Server-only (service role w trybie live).

export interface CampaignSendResult {
  ok: boolean;
  error?: string;
  status?: number;
  kampania?: string;
  odbiorcy?: number;
  pominiete_rodo?: number;
  sends?: { email: string; token: string; sent: boolean; via: string }[];
}

export async function sendCampaignNow(campaignId: string): Promise<CampaignSendResult> {
  const demo = !isSupabaseConfigured();
  if (!demo && !isAdminConfigured()) {
    return { ok: false, error: 'Brak SUPABASE_SERVICE_ROLE_KEY', status: 503 };
  }

  let campaign: EmailCampaign | null;
  let recipients: EmailContact[];
  let firma = 'STRONEVO';

  if (demo) {
    campaign = demoStore.getEmailCampaign(campaignId);
    recipients = campaign?.list_id ? demoStore.listEmailContacts(campaign.list_id) : [];
    const c = campaign?.contact_id ? demoStore.getContact(campaign.contact_id) : null;
    firma = c?.firma ?? c?.imie ?? firma;
  } else {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    campaign = data as EmailCampaign | null;
    recipients = [];
    if (campaign?.list_id) {
      const { data: recs } = await supabase
        .from('email_contacts')
        .select('*')
        .eq('list_id', campaign.list_id);
      recipients = (recs ?? []) as EmailContact[];
    }
    if (campaign?.contact_id) {
      const { data: c } = await supabase
        .from('contacts')
        .select('firma, imie')
        .eq('id', campaign.contact_id)
        .maybeSingle();
      firma = c?.firma ?? c?.imie ?? firma;
    }
  }

  if (!campaign) return { ok: false, error: 'Kampania nie istnieje', status: 404 };
  if (campaign.status === 'wyslana') {
    return { ok: false, error: 'Kampania już wysłana', status: 409 };
  }

  const eligible = recipients.filter((r) => r.zgoda && !r.opt_out);
  const appUrl = (process.env.APP_URL ?? 'https://crm.stronevo.pl').replace(/\/$/, '');
  const sends: { email: string; token: string; sent: boolean; via: string }[] = [];

  for (const r of eligible) {
    const token = newTrackingToken();
    const html = renderCampaignHtml(campaign, { appUrl, token, unsubId: r.id, firma });
    const result = await sendMarketingEmail({
      to: r.email,
      toName: r.imie,
      subject: campaign.temat,
      html,
    });
    const sent = result.data.sent;

    if (demo) {
      demoStore.createEmailSend({
        campaign_id: campaign.id,
        contact_id: campaign.contact_id,
        email: r.email,
        token,
        sent,
        opened_at: null,
        clicked_at: null,
      });
    } else {
      await createAdminClient().from('email_sends').insert({
        campaign_id: campaign.id,
        contact_id: campaign.contact_id,
        email: r.email,
        token,
        sent,
      });
    }
    sends.push({ email: r.email, token, sent, via: result.data.via });
  }

  const patch = { status: 'wyslana' as const, wyslano_at: new Date().toISOString() };
  if (demo) {
    demoStore.updateEmailCampaign(campaign.id, patch);
  } else {
    await createAdminClient().from('email_campaigns').update(patch).eq('id', campaign.id);
  }

  return {
    ok: true,
    kampania: campaign.temat,
    odbiorcy: eligible.length,
    pominiete_rodo: recipients.length - eligible.length,
    sends,
  };
}
