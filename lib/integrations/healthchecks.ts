import { Healthcheck, IntegrationResult } from '@/lib/types';

const MOCK_CHECKS: Healthcheck[] = [
  { nazwa: 'n8n heartbeat', status: 'up', ostatniPing: '2026-07-03T07:55:00Z' },
  { nazwa: 'trends_scout 06:00', status: 'up', ostatniPing: '2026-07-03T06:02:00Z' },
  { nazwa: 'backup nocny', status: 'late', ostatniPing: '2026-07-02T02:05:00Z' },
  { nazwa: 'Coolify proxy', status: 'up', ostatniPing: '2026-07-03T07:58:00Z' },
];

// Healthchecks.io (Management API v3). Bez HC_API_KEY → mock.
// HC_PING (ping URL) zostaje w ENV dla workflowów, które same pingują.
export async function getHealthchecks(): Promise<IntegrationResult<Healthcheck[]>> {
  const apiKey = process.env.HC_API_KEY;

  if (!apiKey) {
    return { source: 'mock', data: MOCK_CHECKS };
  }

  try {
    const res = await fetch('https://healthchecks.io/api/v3/checks/', {
      headers: { 'X-Api-Key': apiKey },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Healthchecks: HTTP ${res.status}`);
    const json = await res.json();

    const data: Healthcheck[] = (json.checks ?? []).map(
      (c: { name: string; status: string; last_ping: string | null }) => ({
        nazwa: c.name,
        status:
          c.status === 'up'
            ? 'up'
            : c.status === 'down'
              ? 'down'
              : c.status === 'grace' || c.status === 'late'
                ? 'late'
                : 'paused',
        ostatniPing: c.last_ping,
      })
    );
    return { source: 'live', data };
  } catch {
    return { source: 'mock', data: MOCK_CHECKS };
  }
}
