import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchDashboardMetrics, fetchCandidateMetrics, DashboardMetrics, CandidateMetrics } from '../services/analytics';

export default function Dashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | CandidateMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isHrOrRecruiter = user?.role === 'hrManager' || user?.role === 'recruiterAdmin';
  const isCandidate = user?.role === 'candidate';

  useEffect(() => {
    if (!isHrOrRecruiter && !isCandidate) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        if (isHrOrRecruiter) {
          const data = await fetchDashboardMetrics();
          setMetrics(data);
        } else if (isCandidate) {
          const data = await fetchCandidateMetrics();
          setMetrics(data);
        }
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, [isHrOrRecruiter, isCandidate]);

  const cards = useMemo(() => {
    if (isHrOrRecruiter) {
      const m = metrics as DashboardMetrics | null;
      return [
        { label: 'Open roles', value: m?.openRoles },
        { label: 'Active candidates', value: m?.activeCandidates },
        { label: 'Interviews scheduled', value: m?.interviewsScheduled },
        { label: 'Offers in progress', value: m?.offersInProgress },
        { label: 'Applications', value: m?.applications }
      ];
    } else if (isCandidate) {
      const m = metrics as CandidateMetrics | null;
      return [
        { label: 'Jobs applied', value: m?.jobsApplied },
        { label: 'Resumes screened in', value: m?.resumesScreenedIn },
        { label: 'Interviews scheduled', value: m?.interviewsScheduled },
        { label: 'Offers received', value: m?.offersReceived }
      ];
    }
    return [];
  }, [metrics, isHrOrRecruiter, isCandidate]);

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p>Welcome, {user?.name || user?.email}</p>

      {error && <p className="error" style={{ marginTop: '0.5rem' }}>{error}</p>}

      {(isHrOrRecruiter || isCandidate) && (
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {cards.map((item) => (
            <div key={item.label} className="card">
              <p className="muted" style={{ marginBottom: '0.35rem' }}>{item.label}</p>
              <h2 style={{ margin: 0 }}>{loading ? '…' : item.value ?? 0}</h2>
            </div>
          ))}
        </div>
      )}

      <div className="card-grid" style={{ marginTop: '1.25rem' }}>
        <div className="card">
          <h3>Job openings</h3>
          <p>Browse and manage open roles.</p>
          <Link to="/jobs">Go to jobs</Link>
        </div>
        {user?.role === 'candidate' && (
          <div className="card">
            <h3>My applications</h3>
            <p>Track your submitted resumes.</p>
            <Link to="/applications">View applications</Link>
          </div>
        )}
      </div>
    </div>
  );
}
