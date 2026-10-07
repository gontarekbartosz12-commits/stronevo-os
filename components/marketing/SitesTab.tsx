'use client';

import { useState } from 'react';
import {
  SiteWithMeta,
  addBlock,
  createSiteFromTemplate,
  getPageBlocks,
  moveBlock,
  removeBlock,
  setSiteStatus,
  updateBlockProps,
} from '@/app/actions/marketing';
import { SITE_TEMPLATES } from '@/lib/marketing';
import { BLOCK_TYPES, BLOCK_TYPE_LABELS, BlockType, Contact, PageBlock } from '@/lib/types';

// Builder stron (operator): lista stron → strony → bloki (dodaj/przenieś/edytuj).
// Iteracja 1: edycja propsów przez pola per typ (items = format „Tytuł | opis").

export default function SitesTab({
  sites,
  klienci,
  onMessage,
}: {
  sites: SiteWithMeta[];
  klienci: Contact[];
  onMessage: (m: string) => void;
}) {
  const [selectedPage, setSelectedPage] = useState<{ siteId: string; pageId: string } | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [editing, setEditing] = useState<PageBlock | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [nowa, setNowa] = useState({ nazwa: '', slug: '', contactId: '', templateKey: 'lokalna-usluga' });

  async function openPage(siteId: string, pageId: string) {
    setSelectedPage({ siteId, pageId });
    setBlocks(await getPageBlocks(pageId));
    setEditing(null);
  }
  async function refreshBlocks() {
    if (selectedPage) setBlocks(await getPageBlocks(selectedPage.pageId));
  }

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await fn();
      await refreshBlocks();
      if (done) onMessage(done);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Błąd');
    } finally {
      setBusy(false);
    }
  }

  const site = sites.find((s) => s.id === selectedPage?.siteId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          {sites.length} stron · publiczny adres: /s/[slug]
        </p>
        <button onClick={() => setShowNew(!showNew)} className="btn-ghost !py-1.5 text-xs">
          + Nowa strona (szablon)
        </button>
      </div>

      {showNew && (
        <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-5">
          <input className="input" placeholder="Nazwa" value={nowa.nazwa} onChange={(e) => setNowa({ ...nowa, nazwa: e.target.value })} />
          <input className="input" placeholder="slug (adres)" value={nowa.slug} onChange={(e) => setNowa({ ...nowa, slug: e.target.value })} />
          <select className="input" value={nowa.contactId} onChange={(e) => setNowa({ ...nowa, contactId: e.target.value })}>
            <option value="">Skrzynka: STRONEVO</option>
            {klienci.map((k) => (
              <option key={k.id} value={k.id}>{k.firma ?? k.imie}</option>
            ))}
          </select>
          <select className="input" value={nowa.templateKey} onChange={(e) => setNowa({ ...nowa, templateKey: e.target.value })}>
            {SITE_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>{t.nazwa}</option>
            ))}
          </select>
          <button
            disabled={busy || !nowa.nazwa || !nowa.slug}
            onClick={() =>
              run(
                () =>
                  createSiteFromTemplate({
                    contactId: nowa.contactId || null,
                    nazwa: nowa.nazwa,
                    slug: nowa.slug,
                    templateKey: nowa.templateKey,
                  }),
                'Strona utworzona ze szablonu (status: szkic). Odśwież stronę, by ją zobaczyć na liście.'
              )
            }
            className="btn-primary !py-2 text-xs"
          >
            Utwórz
          </button>
        </div>
      )}

      {/* Lista stron */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {sites.map((s) => (
          <div key={s.id} className={`card p-4 ${selectedPage?.siteId === s.id ? 'border-gold-dim/50' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-stone-100">{s.nazwa}</p>
                <p className="text-xs text-stone-500">
                  {s.ownerName} ·{' '}
                  <a href={`/s/${s.slug}`} target="_blank" className="text-gold-dim underline">/s/{s.slug}</a>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${s.status === 'opublikowana' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-stone-700/40 text-stone-400'}`}>
                  {s.status}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() => setSiteStatus(s.id, s.status === 'opublikowana' ? 'szkic' : 'opublikowana'), undefined)
                  }
                  className="rounded border border-ink-border px-2 py-1 text-[11px] text-stone-400 hover:text-stone-200"
                >
                  {s.status === 'opublikowana' ? 'Cofnij publikację' : 'Publikuj'}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.pages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openPage(s.id, p.id)}
                  className={`rounded px-2.5 py-1 text-[11px] transition ${selectedPage?.pageId === p.id ? 'bg-bordo/30 font-semibold text-gold-light' : 'border border-ink-border text-stone-400 hover:text-stone-200'}`}
                >
                  /{p.sciezka || '(główna)'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edytor bloków wybranej strony */}
      {selectedPage && (
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-serif text-lg font-bold text-stone-200">
              Sekcje strony {site ? `— ${site.nazwa}` : ''}
            </h3>
            <select
              className="input !w-auto !py-1 text-xs"
              value=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) run(() => addBlock(selectedPage.pageId, e.target.value as BlockType), 'Sekcja dodana.');
              }}
            >
              <option value="">+ Dodaj sekcję...</option>
              {BLOCK_TYPES.map((t) => (
                <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <ul className="divide-y divide-ink-border/60">
            {blocks.map((b) => (
              <li key={b.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-stone-200">
                    {BLOCK_TYPE_LABELS[b.typ]}
                    <span className="ml-2 text-xs text-stone-500">
                      {String((b.props as Record<string, unknown>).naglowek ?? '').slice(0, 50)}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    <button disabled={busy} onClick={() => run(() => moveBlock(selectedPage.pageId, b.id, -1))} className="rounded border border-ink-border px-2 py-0.5 text-xs text-stone-400 hover:text-stone-200">↑</button>
                    <button disabled={busy} onClick={() => run(() => moveBlock(selectedPage.pageId, b.id, 1))} className="rounded border border-ink-border px-2 py-0.5 text-xs text-stone-400 hover:text-stone-200">↓</button>
                    <button onClick={() => setEditing(editing?.id === b.id ? null : b)} className="rounded border border-gold-dim/40 px-2 py-0.5 text-xs text-gold-light hover:bg-gold/10">Edytuj</button>
                    <button disabled={busy} onClick={() => run(() => removeBlock(b.id), 'Sekcja usunięta.')} className="rounded border border-bordo/50 px-2 py-0.5 text-xs text-bordo-glow hover:bg-bordo/15">Usuń</button>
                  </span>
                </div>
                {editing?.id === b.id && (
                  <BlockPropsEditor
                    block={b}
                    busy={busy}
                    onSave={(props) => run(() => updateBlockProps(b.id, props), 'Sekcja zapisana.').then(() => setEditing(null))}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Edycja propsów per typ — items jako linie „Tytuł | opis" (proste i szybkie)
function BlockPropsEditor({
  block,
  busy,
  onSave,
}: {
  block: PageBlock;
  busy: boolean;
  onSave: (props: Record<string, unknown>) => void;
}) {
  const p = block.props as Record<string, unknown>;
  const itemsToText = (items: unknown, kolumny: string[]): string =>
    ((items as Record<string, unknown>[]) ?? [])
      .map((it) => kolumny.map((k) => String(it[k] ?? '')).join(' | '))
      .join('\n');
  const textToItems = (text: string, kolumny: string[]) =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split('|').map((x) => x.trim());
        return Object.fromEntries(kolumny.map((k, i) => [k, parts[i] ?? '']));
      });

  const itemCols =
    block.typ === 'features' ? ['tytul', 'opis']
    : block.typ === 'testimonials' ? ['autor', 'tresc']
    : block.typ === 'pricing' ? ['nazwa', 'cena', 'opis']
    : null;

  const [form, setForm] = useState<Record<string, string>>({
    naglowek: String(p.naglowek ?? ''),
    podtytul: String(p.podtytul ?? ''),
    tresc: String(p.tresc ?? ''),
    cta_label: String(p.cta_label ?? ''),
    cta_url: String(p.cta_url ?? ''),
    url: String(p.url ?? ''),
    podpis: String(p.podpis ?? ''),
    form_id: String(p.form_id ?? ''),
    items: itemCols ? itemsToText(p.items, itemCols) : '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function save() {
    const props: Record<string, unknown> = { ...p };
    if (['hero', 'features', 'cta', 'testimonials', 'text', 'pricing', 'form'].includes(block.typ))
      props.naglowek = form.naglowek;
    if (block.typ === 'hero') props.podtytul = form.podtytul;
    if (['text', 'cta'].includes(block.typ)) props.tresc = form.tresc;
    if (['hero', 'cta'].includes(block.typ)) {
      props.cta_label = form.cta_label;
      props.cta_url = form.cta_url;
    }
    if (block.typ === 'image') {
      props.url = form.url;
      props.podpis = form.podpis;
    }
    if (block.typ === 'form') props.form_id = form.form_id || null;
    if (itemCols) props.items = textToItems(form.items, itemCols);
    onSave(props);
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-ink-border bg-ink-soft/60 p-3">
      {'naglowek' in form && block.typ !== 'image' && (
        <input className="input" placeholder="Nagłówek" value={form.naglowek} onChange={set('naglowek')} />
      )}
      {block.typ === 'hero' && (
        <input className="input" placeholder="Podtytuł" value={form.podtytul} onChange={set('podtytul')} />
      )}
      {['text', 'cta'].includes(block.typ) && (
        <textarea className="input" rows={3} placeholder="Treść" value={form.tresc} onChange={set('tresc')} />
      )}
      {['hero', 'cta'].includes(block.typ) && (
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Tekst przycisku" value={form.cta_label} onChange={set('cta_label')} />
          <input className="input" placeholder="Link przycisku" value={form.cta_url} onChange={set('cta_url')} />
        </div>
      )}
      {block.typ === 'image' && (
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="URL obrazu" value={form.url} onChange={set('url')} />
          <input className="input" placeholder="Podpis" value={form.podpis} onChange={set('podpis')} />
        </div>
      )}
      {block.typ === 'form' && (
        <input className="input" placeholder="ID formularza (zakładka Formularze)" value={form.form_id} onChange={set('form_id')} />
      )}
      {itemCols && (
        <div>
          <p className="mb-1 text-[11px] text-stone-500">
            Pozycje — jedna na linię, kolumny rozdzielone „|": {itemCols.join(' | ')}
          </p>
          <textarea className="input font-mono text-xs" rows={4} value={form.items} onChange={set('items')} />
        </div>
      )}
      <button disabled={busy} onClick={save} className="btn-primary !py-1.5 text-xs">
        {busy ? 'Zapisywanie...' : 'Zapisz sekcję'}
      </button>
    </div>
  );
}
