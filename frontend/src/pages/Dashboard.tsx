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
        { label: 'Open roles', value: m?.openRoles, icon: '💼', color: 'blue' },
        { label: 'Active candidates', value: m?.activeCandidates, icon: '👥', color: 'green' },
        { label: 'Applications', value: m?.applications, icon: '📄', color: 'purple' },
        { label: 'Screened in', value: m?.screenedIn, icon: '✅', color: 'emerald' },
        { label: 'Screened out', value: m?.screenedOut, icon: '❌', color: 'red' },
        { label: 'Interviews scheduled', value: m?.interviewsScheduled, icon: '📅', color: 'indigo' },
        { label: 'Offers in progress', value: m?.offersInProgress, icon: '🎯', color: 'orange' }
      ];
    } else if (isCandidate) {
      const m = metrics as CandidateMetrics | null;
      return [
        { label: 'Jobs applied', value: m?.jobsApplied, icon: '📄', color: 'blue' },
        { label: 'Resumes screened in', value: m?.resumesScreenedIn, icon: '✅', color: 'green' },
        { label: 'Interviews scheduled', value: m?.interviewsScheduled, icon: '📅', color: 'purple' },
        { label: 'Offers received', value: m?.offersReceived, icon: '🎉', color: 'orange' }
      ];
    }
    return [];
  }, [metrics, isHrOrRecruiter, isCandidate]);

  return (
    <div className="page" style={{ animation: 'fadeIn 0.6s ease' }}>
      {/* Welcome Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.08) 0%, rgba(10, 102, 194, 0.02) 100%)',
        borderRadius: 'var(--radius)',
        padding: '2rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(10, 102, 194, 0.15)'
      }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: '700',
          marginBottom: '0.5rem',
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-strong) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          {isCandidate ? '👋 Welcome back!' : '📊 Dashboard'}
        </h1>
        <p className="muted" style={{ fontSize: '1rem', margin: 0 }}>
          {isCandidate 
            ? `Hi ${user?.name || user?.email}, here's your job search progress`
            : `Welcome, ${user?.name || user?.email}`
          }
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          background: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          borderLeft: '4px solid #DC2626',
          borderRadius: 'var(--radius)',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <p className="error" style={{ margin: 0 }}>⚠️ {error}</p>
        </div>
      )}

      {/* Metrics Grid */}
      {(isHrOrRecruiter || isCandidate) && (
        <div className="card-grid" style={{ 
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          marginBottom: '1.5rem'
        }}>
          {cards.map((item) => (
            <div
              key={item.label}
              className="card"
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderTop: `4px solid ${
                  item.color === 'blue' ? '#3B82F6' :
                  item.color === 'green' ? '#10B981' :
                  item.color === 'purple' ? '#8B5CF6' :
                  item.color === 'orange' ? '#F59E0B' :
                  item.color === 'emerald' ? '#059669' :
                  item.color === 'red' ? '#DC2626' :
                  '#6366F1'
                }`,
                animation: `slideUp 0.5s ease ${cards.indexOf(item) * 0.1}s backwards`
              }}
            >
              <div style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                marginBottom: '1rem',
                background: `${
                  item.color === 'blue' ? 'rgba(59, 130, 246, 0.1)' :
                  item.color === 'green' ? 'rgba(16, 185, 129, 0.1)' :
                  item.color === 'purple' ? 'rgba(139, 92, 246, 0.1)' :
                  item.color === 'orange' ? 'rgba(245, 158, 11, 0.1)' :
                  item.color === 'emerald' ? 'rgba(5, 150, 105, 0.1)' :
                  item.color === 'red' ? 'rgba(220, 38, 38, 0.1)' :
                  'rgba(99, 102, 241, 0.1)'
                }`
              }}>
                {item.icon}
              </div>
              <p className="muted" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>
                {item.label}
              </p>
              <h2 style={{ 
                fontSize: '2.5rem', 
                fontWeight: '700',
                margin: 0,
                color: 'var(--text)'
              }}>
                {loading ? (
                  <span style={{ 
                    display: 'inline-block',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}>
                    ...
                  </span>
                ) : (
                  item.value ?? 0
                )}
              </h2>
            </div>
          ))}
        </div>
      )}

      {/* Action Cards */}
      <div className="card-grid" style={{ 
        gridTemplateColumns: isCandidate ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr'
      }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.05) 0%, rgba(10, 102, 194, 0.02) 100%)',
          border: '1px solid rgba(10, 102, 194, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: '3rem',
              height: '3rem',
              background: 'rgba(10, 102, 194, 0.15)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem'
            }}>
              🔍
            </div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Job openings</h3>
          </div>
          <p style={{ marginBottom: '1rem', lineHeight: '1.6' }}>
            Browse and manage open roles. Find opportunities that match your criteria.
          </p>
          <Link 
            to="/jobs" 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--primary)',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: 'var(--radius)',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              textDecoration: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary-strong)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(10, 102, 194, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Go to jobs <span>→</span>
          </Link>
        </div>

        {user?.role === 'candidate' && (
          <div className="card" style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(16, 185, 129, 0.02) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: '3rem',
                height: '3rem',
                background: 'rgba(16, 185, 129, 0.15)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem'
              }}>
                📋
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>My applications</h3>
            </div>
            <p style={{ marginBottom: '1rem', lineHeight: '1.6' }}>
              Track your submitted resumes and monitor application status in real-time.
            </p>
            <Link 
              to="/applications"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'white',
                color: 'var(--primary)',
                border: '2px solid var(--primary)',
                padding: '0.75rem 1.5rem',
                borderRadius: 'var(--radius)',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                textDecoration: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(10, 102, 194, 0.05)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(10, 102, 194, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              View applications <span>→</span>
            </Link>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}