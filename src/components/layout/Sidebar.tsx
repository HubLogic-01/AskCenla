import { NavLink } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/app/providers/AuthProvider';
import { NAV_BY_ROLE, ROLE_LABEL, type NavItem } from './navigation';

export type NavCounts = Partial<Record<NonNullable<NavItem['countKey']>, number>>;

export function Sidebar({
  open,
  onClose,
  counts,
}: {
  open: boolean;
  onClose: () => void;
  counts: NavCounts;
}) {
  const { profile, signOut, isLive } = useAuth();
  if (!profile) return null;

  const sections = NAV_BY_ROLE[profile.role];

  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <nav className={`sidebar${open ? ' is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar__brand">
          <span className="brandmark">AC</span>
          <span>
            <span className="brand-name">AskCENLA</span>
            <span className="brand-sub">Repair Network</span>
          </span>
        </div>

        <div className="sidebar__nav">
          {sections.map((section, i) => (
            <div className="sidebar__section" key={i}>
              {section.title && <div className="sidebar__section-title">{section.title}</div>}
              {section.items.map((item) => {
                const count = item.countKey ? counts[item.countKey] : undefined;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
                  >
                    <Icon name={item.icon} size={18} className="sidebar__link-icon" />
                    <span>{item.label}</span>
                    {count ? <span className="sidebar__count">{count}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        <div className="sidebar__footer">
          {!isLive && (
            <div className="demo-flag" title="No database connected — this is demo data">
              <Icon name="alert" size={13} />
              Demo data
            </div>
          )}
          <div className="sidebar__user">
            <Avatar name={profile.full_name} size="sm" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sidebar__user-name">{profile.full_name}</div>
              <div className="sidebar__user-role">{ROLE_LABEL[profile.role]}</div>
            </div>
            <button
              className="icon-btn"
              onClick={() => void signOut()}
              aria-label="Sign out"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
