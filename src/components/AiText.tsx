import { Fragment, type ReactNode } from 'react';
import { cleanMath } from '../lib/ai';

// Rendu léger des réponses de l'IA : titres, gras, listes, tableaux, formules (sans innerHTML).
function inline(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p.replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2')}</Fragment>));
}

export function AiText({ text }: { text: string }) {
  const lines = cleanMath(text).split('\n');
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trimEnd();
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
        i++;
      }
      i--;
      out.push(<div key={i} className="table-wrap"><table className="table ai-table"><tbody>
        {rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => ri === 0 ? <th key={ci}>{inline(c)}</th> : <td key={ci}>{inline(c.replace(/<br\s*\/?>/g, ' · '))}</td>)}</tr>)}
      </tbody></table></div>);
    } else if (/^#{1,6}\s/.test(l)) out.push(<p key={i} className="ai-h">{inline(l.replace(/^#{1,6}\s*/, ''))}</p>);
    else if (/^\s*---+\s*$/.test(l)) out.push(<hr key={i} />);
    else if (/^\s*[-*•]\s+/.test(l)) out.push(<p key={i} className="ai-li">• {inline(l.replace(/^\s*[-*•]\s+/, ''))}</p>);
    else if (l.trim()) out.push(<p key={i}>{inline(l)}</p>);
  }
  return <div className="ai-text">{out}</div>;
}
