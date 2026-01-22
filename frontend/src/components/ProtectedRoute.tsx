import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type Props = { roles?: string[] };

export default function ProtectedRoute({ roles }: Props) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page">
    <p>Loading session...</p>
  </div>;

  if (!user) return <Navigate to="/login" replace />;

  if (roles && roles.length && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
