import { IntegrationResult, VpsStatus } from '@/lib/types';

const MOCK_VPS: VpsStatus = {
  host: 'stronevo-prod',
  ramUsedGb: 3.4,
  ramTotalGb: 8,
  diskUsedGb: 42.7,
  diskTotalGb: 80,
  load1: 0.38,
  load5: 0.22,
  load15: 0.14,
  uptime: '31 dni',
};

// Status VPS. Oczekuje endpointu JSON pod VPS_METRICS_URL, np. prostego
// skryptu na serwerze zwracającego { ramUsedGb, ramTotalGb, diskUsedGb,
// diskTotalGb, load1, load5, load15, uptime }. Bez konfiguracji → mock.
export async function getVpsStatus(): Promise<IntegrationResult<VpsStatus>> {
  const metricsUrl = process.env.VPS_METRICS_URL;
  const host = process.env.VPS_HOST ?? MOCK_VPS.host;

  if (!metricsUrl) {
    return { source: 'mock', data: { ...MOCK_VPS, host } };
  }

  try {
    const headers: Record<string, string> = {};
    if (process.env.VPS_METRICS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.VPS_METRICS_TOKEN}`;
    }
    const res = await fetch(metricsUrl, { headers, next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`VPS metrics: HTTP ${res.status}`);
    const json = await res.json();
    return { source: 'live', data: { ...MOCK_VPS, ...json, host } };
  } catch {
    return { source: 'mock', data: { ...MOCK_VPS, host } };
  }
}
