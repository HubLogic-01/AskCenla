import type { Attachment } from '@/types/domain';
import { Icon } from '@/components/ui/Icon';
import { fileSize, shortDate } from '@/lib/format';

const KIND_LABEL: Record<Attachment['kind'], string> = {
  inspection_report: 'Inspection report',
  photo: 'Photo',
  supporting_document: 'Supporting document',
  quote_attachment: 'Quote attachment',
};

/**
 * Attachments are always rendered from `storage_path`, never from a public URL.
 * In Phase 2 the "Open" action calls
 * `supabase.storage.from('private').createSignedUrl(path, 60)` so the link is
 * short-lived and tied to the signed-in user's permissions.
 */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) {
    return <p className="text-muted text-sm">No documents uploaded.</p>;
  }

  return (
    <div className="stack stack-3">
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
        </div>
      ))}
    </div>
  );
}
