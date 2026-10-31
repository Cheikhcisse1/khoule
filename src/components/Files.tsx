import { useRef, useState } from 'react';
import { fileLabel, openFile, type Bucket } from '../lib/storage';
import { useToast } from './ui';

/** Liste de fichiers privés (ouverts via URL signée). */
export function FileLinks({ bucket, paths }: { bucket: Bucket; paths: string[] }) {
  const toast = useToast();
  if (!paths.length) return null;
  return (
    <ul className="file-links">
      {paths.map((p) => (
        <li key={p}>
          <button type="button" className="link" onClick={() => openFile(bucket, p).catch((e: Error) => toast(e.message, 'error'))}>
            📎 {fileLabel(p)}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Sélecteur de fichiers (glisser-déposer ou parcourir). */
export function FilePicker({ files, onChange, multiple = true, accept }:
  { files: File[]; onChange: (f: File[]) => void; multiple?: boolean; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    onChange(multiple ? [...files, ...arr] : arr.slice(0, 1));
  };
  return (
    <div>
      <div className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}>
        <span aria-hidden>📤</span> Glissez un fichier ici ou <u>parcourez</u>
        <small className="muted">PDF, images, documents{accept?.includes('video') ? ', vidéos' : ''}</small>
        <input ref={input} type="file" hidden multiple={multiple} accept={accept}
          onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <ul className="picked">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.name} <small className="muted">({Math.round(f.size / 1024)} Ko)</small>
              <button type="button" className="icon-btn" aria-label={`Retirer ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
