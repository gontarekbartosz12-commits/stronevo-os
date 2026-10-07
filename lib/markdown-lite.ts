// Minimalny renderer Markdown → HTML pod szablon umowy (bez zależności).
// Obsługuje: # ## ### nagłówki, **bold**, *italic*, > cytat, - listy,
// | tabele |, --- separator, akapity per linia (zachowuje numerację prawną).
// Treść pochodzi z własnego szablonu; dane merge są escapowane wcześniej.

function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    // Tabela: zbierz kolejne linie zaczynające się od |
    if (trimmed.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
        // pomiń wiersz separatora |---|---|
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      html.push('<table>');
      if (head) {
        html.push(
          `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
        );
      }
      html.push(
        `<tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody>`
      );
      html.push('</table>');
      continue;
    }

    // Lista punktowana: zbierz kolejne "- "
    if (trimmed.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      html.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</ul>`);
      continue;
    }

    // Cytat: zbierz kolejne "> "
    if (trimmed.startsWith('>')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        parts.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${inline(parts.join(' '))}</blockquote>`);
      continue;
    }

    if (trimmed === '---') {
      html.push('<hr/>');
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      html.push(`<h3>${inline(trimmed.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      html.push(`<h2>${inline(trimmed.slice(3))}</h2>`);
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      html.push(`<h1>${inline(trimmed.slice(2))}</h1>`);
      i++;
      continue;
    }

    // Zwykła linia = akapit (klauzule "1." / "a)" zostają w swoich liniach);
    // wcięcie liter a)/b)/c) zachowujemy klasą
    const indented = /^\s{2,}[a-z]\)/.test(line);
    html.push(`<p${indented ? ' class="ind"' : ''}>${inline(trimmed)}</p>`);
    i++;
  }

  return html.join('\n');
}
