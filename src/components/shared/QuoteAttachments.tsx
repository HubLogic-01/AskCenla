import { useRef, useState } from 'react';
import type { Attachment } from '@/types/domain';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { fileSize } from '@/lib/format';
import { useData } from '@/app/providers/DataProvider';
import { useAction } from '@/lib/useAction';

/** Matches the bucket's file_size_limit in supabase/migrations/0003_storage.sql. */
const MAX_FILE_MB = 25;

/**
 * Files a contractor attaches to a quote — a spec sheet, a warranty, a photo
 * of the fault. Stored in the same private bucket as inspection reports, so
 * they are only readable by people who can already read the quote.
 */
export function QuoteAttachments({
  quoteId,
  attachments,
  editable,
}: {
  quoteId: string;
  attachments: Attachment[];
  editable: boolean;
}) {
  const { uploadQuoteAttachment, removeAttachment, attachmentUrl, isLive } = useData();
  const { busy, error, run } = useAction();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);

    const tooBig = files.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig.length > 0) {
      setNotice(`${tooBig.map((f) => f.name).join(', ')} — over the ${MAX_FILE_MB} MB limit.`);
      return;
    }

    setNotice(null);
    void run(async () => {
      for (const file of files) {
        await uploadQuoteAttachment(quoteId, file);
      }
    });
  }

  async function open(attachment: Attachment) {
    const url = await attachmentUrl(attachment);
    if (!url) {
      setNotice(
        isLive
          ? 'That file could not be opened. You may no longer have access to it.'
          : 'File contents are not available on demo data — connect Supabase to open documents.',
      );
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="stack stack-3">
      {(error || notice) && <p className="field__error">{error ?? notice}</p>}

      {attachments.map((a) => (
        <div className="file-row" key={a.id}>
          <span className="file-row__icon">
            <Icon name={a.mime_type.startsWith('image/') ? 'clipboard' : 'file'} size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="file-row__name">{a.file_name}</div>
            <div className="file-row__meta">{fileSize(a.size_bytes)}</div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void open(a)}>
            Open
          </Button>
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => removeAttachment(a))}
            >
              Remove
            </Button>
          )}
        </div>
      ))}

      {editable && (
        <div
          className={`dropzone${dragging ? ' is-active' : ''}`}
          role="button"
          tabIndex={0}
          style={{ padding: 'var(--sp-6)' }}
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
          <div className="row" style={{ justifyContent: 'center', gap: 'var(--sp-3)' }}>
            <Icon name="upload" size={18} />
            <span className="text-sm text-semibold text-strong">
              {busy ? 'Uploading…' : 'Attach a photo, spec sheet or warranty'}
            </span>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 'var(--sp-2)' }}>
            Stored privately · up to {MAX_FILE_MB}&nbsp;MB each
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            accept=".pdf,.doc,.docx,image/*"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {!editable && attachments.length === 0 && (
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          No attachments.
        </p>
      )}
    </div>
  );
}
