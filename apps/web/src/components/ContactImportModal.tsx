import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { api, type Envelope } from '../lib/api';
import { CONTACT_IMPORT_FIELDS, parseCsvHeaders, suggestContactMapping } from '../lib/contact-import';
import { toast } from '../lib/toast';
import { Button, Modal, SelectField } from './ui';

type ImportResult = {
  total: number;
  valid: number;
  errors: number;
  results: Array<{ row: number; status: 'valid' | 'created' | 'error'; id?: string; error?: string }>;
};

const TEMPLATE = [
  'nome;email;telefone;cargo;origem;id_externo',
  'Maria Silva;maria@empresa.com.br;45999999999;Gerente;Importação CSV;contato-001',
].join('\r\n');

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([`\uFEFF${TEMPLATE}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo-importacao-contatos.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast.success('Modelo CSV baixado.');
}

export function ContactImportModal({ onClose, onImported }: { onClose(): void; onImported(): void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const preview = useMutation({
    mutationFn: (payload: { csv: string; mapping: Record<string, string> }) =>
      api<Envelope<ImportResult>>('/imports/csv', {
        method: 'POST',
        body: JSON.stringify({ entityType: 'contacts', ...payload, commit: false }),
      }),
    onSuccess: ({ data }) => setPreviewResult(data),
  });
  const commit = useMutation({
    mutationFn: () => api<Envelope<ImportResult>>('/imports/csv', {
      method: 'POST',
      body: JSON.stringify({ entityType: 'contacts', csv, mapping, commit: true }),
    }),
    onSuccess: ({ data }) => {
      if (data.errors) toast.warning(`${data.valid} contato(s) importado(s) e ${data.errors} linha(s) ignorada(s).`);
      else toast.success(`${data.valid} contato(s) importado(s) com sucesso.`);
      onImported();
    },
  });

  const chooseFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && !['text/csv', 'application/csv', 'application/vnd.ms-excel'].includes(file.type)) {
      toast.warning('Selecione um arquivo no formato CSV.');
      return;
    }
    try {
      const text = await file.text();
      const nextHeaders = parseCsvHeaders(text);
      if (!nextHeaders.length) {
        toast.warning('O arquivo CSV não possui uma linha de cabeçalho.');
        return;
      }
      setFileName(file.name);
      setCsv(text);
      setHeaders(nextHeaders);
      setMapping(suggestContactMapping(nextHeaders));
      setPreviewResult(null);
    } catch {
      toast.error('Não foi possível ler o arquivo CSV.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const mappedValues = new Set(Object.values(mapping).filter(Boolean));
  const hasName = mappedValues.has('name');
  const canPreview = Boolean(csv && hasName && !preview.isPending && !commit.isPending);
  const mapColumn = (header: string, target: string) => {
    setMapping((current) => ({ ...current, [header]: target }));
    setPreviewResult(null);
  };

  return <Modal title="Importar contatos" onClose={onClose} width={760}>
    <div className="contact-import-content">
      <div className="contact-import-options">
        <button type="button" onClick={downloadTemplate}>
          <span><Download size={22} /></span>
          <div><strong>Baixar modelo CSV</strong><small>Use uma planilha pronta com todas as colunas aceitas.</small></div>
        </button>
        <button
          type="button"
          className={dragging ? 'dragging' : ''}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void chooseFile(event.dataTransfer.files[0]);
          }}
        >
          <span><Upload size={22} /></span>
          <div><strong>Importar arquivo CSV</strong><small>Selecione ou arraste o arquivo preenchido para esta área.</small></div>
        </button>
        <input ref={inputRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event.target.files?.[0])} />
      </div>

      {fileName && <section className="contact-import-file">
        <header><span><FileSpreadsheet size={19} /></span><div><strong>{fileName}</strong><small>{headers.length} coluna(s) encontrada(s)</small></div><button type="button" onClick={() => inputRef.current?.click()}>Trocar arquivo</button></header>
        <div className="contact-import-mapping">
          <div><h3>Relacionar colunas</h3><p>Confirme qual informação corresponde a cada coluna do arquivo.</p></div>
          <div className="contact-import-mapping-grid">
            {headers.map((header) => <SelectField key={header} label={header} value={mapping[header] || ''} onChange={(event) => mapColumn(header, event.target.value)}>
              <option value="">Não importar</option>
              {CONTACT_IMPORT_FIELDS.map((field) => <option key={field.value} value={field.value} disabled={mappedValues.has(field.value) && mapping[header] !== field.value}>{field.label}{'required' in field && field.required ? ' *' : ''}</option>)}
            </SelectField>)}
          </div>
          {!hasName && <p className="contact-import-required">Relacione uma coluna ao campo “Nome completo” para continuar.</p>}
        </div>
      </section>}

      {previewResult && <section className="contact-import-preview">
        <div><span className="valid"><CheckCircle2 size={18} /></span><strong>{previewResult.valid}</strong><small>prontos para importar</small></div>
        <div><span className={previewResult.errors ? 'invalid' : 'muted'}><XCircle size={18} /></span><strong>{previewResult.errors}</strong><small>linhas com erro</small></div>
        <div><strong>{previewResult.total}</strong><small>linhas analisadas</small></div>
        {previewResult.errors > 0 && <details><summary>Ver erros encontrados</summary>{previewResult.results.filter((item) => item.status === 'error').slice(0, 30).map((item) => <p key={item.row}>Linha {item.row}: {item.error}</p>)}</details>}
      </section>}
    </div>

    <div className="modal-actions contact-import-actions">
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      {!previewResult
        ? <Button loading={preview.isPending} disabled={!canPreview} onClick={() => preview.mutate({ csv, mapping })}>Validar arquivo</Button>
        : <Button loading={commit.isPending} disabled={!previewResult.valid} onClick={() => commit.mutate()}><Upload size={16} />Importar {previewResult.valid} contato(s)</Button>}
    </div>
  </Modal>;
}
