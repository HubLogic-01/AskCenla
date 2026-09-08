import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/app/providers/AuthProvider';
import { useData } from '@/app/providers/DataProvider';
import { relativeTime } from '@/lib/format';

export function Topbar({ onMenu, title }: { onMenu: () => void; title: string }) {
  const { profile } = useAuth();
  const { notifications, markNotificationRead, markAllNotificationsRead } = useData();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const mine = notifications
    .filter((n) => n.recipient_id === profile?.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unread = mine.filter((n) => !n.read_at).length;

  return (
    <header className="topbar">
      <button className="icon-btn menu-toggle" onClick={onMenu} aria-label="Open navigation">
        <Icon name="menu" />
      </button>
      <div className="topbar__title">{title}</div>
      <div className="spacer" />
      <div style={{ position: 'relative' }}>
        <button
          className="icon-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
          aria-expanded={open}
        >
          <Icon name="bell" />
          {unread > 0 && <span className="icon-btn__dot" />}
        </button>
      </div>

      {open && (
        <>
          <button
            className="sidebar-scrim"
            style={{ background: 'transparent', zIndex: 54 }}
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="notif-panel">
            <div className="card__header" style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
              <div className="card__title">Notifications</div>
              {unread > 0 && profile && (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => void markAllNotificationsRead(profile.id)}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {mine.length === 0 && (
                <div style={{ padding: 'var(--sp-8)', textAlign: 'center' }} className="text-muted text-sm">
                  You are all caught up.
                </div>
              )}
              {mine.slice(0, 12).map((n) => (
                <button
                  key={n.id}
                  className={`notif${n.read_at ? '' : ' is-unread'}`}
                  onClick={() => {
                    void markNotificationRead(n.id);
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <div>
                    <div className="notif__title">{n.title}</div>
                    <div className="notif__body">{n.body}</div>
                    <div className="notif__time">{relativeTime(n.created_at)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
