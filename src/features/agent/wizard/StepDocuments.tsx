import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { fileSize } from '@/lib/format';
import type { DraftAttachment } from '@/app/providers/DataProvider';
import type { AttachmentKind } from '@/types/domain';
import type { WizardState } from './types';

const KIND_LABEL: Record<AttachmentKind, string> = {
  inspection_report: 'Inspection report',
  photo: 'Photo',
  supporting_document: 'Supporting document',
  quote_attachment: 'Quote attachment',
};

/** Matches the bucket's file_size_limit in supabase/migrations/0003_storage.sql. */
const MAX_FILE_MB = 25;

/** Infers the attachment kind so the agent does not have to classify every file. */
function inferKind(file: File): AttachmentKind {
  if (file.type.startsWith('image/')) return 'photo';
  if (/inspect/i.test(file.name)) return 'inspection_report';
  return 'supporting_document';
}

export function StepDocuments({
  state,
  update,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Checked here so the agent finds out before submitting, not after the
  // request is saved and the upload bounces.
  const oversized = state.files
    .filter((f) => f.size_bytes > MAX_FILE_MB * 1024 * 1024)
    .map((f) => f.file_name);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: DraftAttachment[] = Array.from(list).map((file) => ({
      file_name: file.name,
      size_bytes: file.size,
      mime_type: file.type || 'application/octet-stream',
      kind: inferKind(file),
      // Keep the real File. It is what actually gets uploaded to the private
      // bucket on submit; the fields above are only what we record about it.
      file,
    }));
    update({ files: [...state.files, ...next] });
  }

  return (
    <>
      <Alert tone="success" title="Inspection reports are stored privately">
        Files go into a private storage bucket. AskCENLA never creates a public link — a contractor only
        receives time-limited access after they accept that trade.
      </Alert>

      {oversized.length > 0 && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <Alert tone="warning" title="Some files are too large">
            {oversized.join(', ')} — the limit is {MAX_FILE_MB}&nbsp;MB per file. Remove them before
            submitting, or the upload will be rejected.
          </Alert>
        </div>
      )}

      <div style={{ height: 'var(--sp-5)' }} />

      <div
        className={`dropzone${dragging ? ' is-active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <div style={{ display: 'grid', placeItems: 'center', gap: 'var(--sp-3)' }}>
          <Icon name="upload" size={26} />
          <div className="text-semibold text-strong">Drop files here, or click to browse</div>
          <div className="text-sm text-muted">
            Inspection report PDF, photos, and any supporting documents · up to 25&nbsp;MB each
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,.doc,.docx,image/*"
          onChange={(e) => {
            addFiles(e.target.files);
            // Reset so picking the same file twice still fires a change event.
            e.target.value = '';
          }}
        />
      </div>

      {state.files.length > 0 && (
        <div className="stack stack-3" style={{ marginTop: 'var(--sp-5)' }}>
          {state.files.map((f, i) => (
            <div className="file-row" key={`${f.file_name}-${i}`}>
              <span className="file-row__icon">
                <Icon name={f.mime_type.startsWith('image/') ? 'clipboard' : 'file'} size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="file-row__name">{f.file_name}</div>
                <div className="file-row__meta">
                  {KIND_LABEL[f.kind]} · {fileSize(f.size_bytes)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update({ files: state.files.filter((_, idx) => idx !== i) })}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {state.files.length === 0 && (
        <p className="text-sm text-muted" style={{ marginTop: 'var(--sp-5)' }}>
          Documents are optional, but attaching the inspection report gets contractors to an accurate
          quote far faster.
        </p>
      )}
    </>
  );
}
