import { useState } from 'react';
import type { Attachment } from '@/types/domain';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { fileSize, shortDate } from '@/lib/format';
import { useData } from '@/app/providers/DataProvider';

const KIND_LABEL: Record<Attachment['kind'], string> = {
  inspection_report: 'Inspection report',
  photo: 'Photo',
  supporting_document: 'Supporting document',
  quote_attachment: 'Quote attachment',
};

/**
 * Attachments are always addressed by `storage_path`, never by a stored URL.
 *
 * Opening one asks the data layer for a SIGNED url, which Supabase issues only
 * if the storage policies pass for the signed-in user and which expires after
 * a minute. Nothing here is a permanent public link, and there is no URL in
 * the database that could be forwarded or leaked.
 */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const { attachmentUrl, isLive } = useData();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(attachment: Attachment) {
    setOpeningId(attachment.id);
    setError(null);
    try {
      const url = await attachmentUrl(attachment);
      if (!url) {
        setError(
          isLive
            ? 'That file could not be opened. You may no longer have access to it.'
            : 'File contents are not available on demo data — connect Supabase to open documents.',
        );
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('That file could not be opened.');
    } finally {
      setOpeningId(null);
    }
  }

  if (attachments.length === 0) {
    return <p className="text-muted text-sm">No documents uploaded.</p>;
  }

  return (
    <div className="stack stack-3">
      {error && <p className="field__error">{error}</p>}
      {attachments.map((a) => (
        <div className="file-row" key={a.id}>
          <span className="file-row__icon">
            <Icon name={a.mime_type.startsWith('image/') ? 'clipboard' : 'file'} size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="file-row__name">{a.file_name}</div>
            <div className="file-row__meta">
              {KIND_LABEL[a.kind]} · {fileSize(a.size_bytes)} · {shortDate(a.created_at)}
            </div>
          </div>
          <span className="lock-note">
            <Icon name="lock" size={13} /> Private
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={openingId === a.id}
            onClick={() => void open(a)}
          >
            {openingId === a.id ? 'Opening…' : 'Open'}
          </Button>
        </div>
      ))}
    </div>
  );
}
