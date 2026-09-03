import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, HOME_BY_ROLE } from '@/app/providers/AuthProvider';
import type { UserRole } from '@/types/domain';

/**
 * ROUTE GUARD
 * ---------------------------------------------------------------------------
 * This keeps people out of the wrong screens, but it is CONVENIENCE, not
 * security. The real enforcement is Supabase Row Level Security (Phase 2):
 * even if someone edits the bundle and forces this component to render, the
 * database returns zero rows for data they are not entitled to.
 */
export function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }} className="text-muted">
        Loading…
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={HOME_BY_ROLE[profile.role]} replace />;
  }

  return <Outlet />;
}
