import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchJobWiseAnalytics, fetchCandidateMetrics, JobWiseAnalyticsResponse, CandidateMetrics } from '../services/analytics';

export default function Dashboard() {
  const { user } = useAuth();
  const [jobAnalytics, setJobAnalytics] = useState<JobWiseAnalyticsResponse | null>(null);
  const [candidateMetrics, setCandidateMetrics] = useState<CandidateMetrics | null>(null);
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
          const data = await fetchJobWiseAnalytics();
          setJobAnalytics(data);
        } else if (isCandidate) {
          const data = await fetchCandidateMetrics();
          setCandidateMetrics(data);
        }
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, [isHrOrRecruiter, isCandidate]);

  const candidateCards = useMemo(() => {
    if (!isCandidate) return [];
    const m = candidateMetrics;
    return [
      { label: 'Jobs applied', value: m?.jobsApplied, icon: '📄', color: 'blue' },
      { label: 'Resumes screened in', value: m?.resumesScreenedIn, icon: '✅', color: 'green' },
      { label: 'Interviews scheduled', value: m?.interviewsScheduled, icon: '📅', color: 'purple' },
      { label: 'Offers received', value: m?.offersReceived, icon: '🎉', color: 'orange' }
    ];
  }, [candidateMetrics, isCandidate]);

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

      {/* HR/Recruiter: Job-wise Analytics */}
      {isHrOrRecruiter && (
        <>
          {/* Summary Cards */}
          <div className="card-grid" style={{ 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            marginBottom: '1.5rem'
          }}>
            {[
              { label: 'Total Jobs', value: jobAnalytics?.totalJobs, icon: '💼', color: 'blue' },
              { label: 'Active Jobs', value: jobAnalytics?.activeJobs, icon: '✅', color: 'green' },
              { label: 'Total Applications', value: jobAnalytics?.totals?.total, icon: '📄', color: 'purple' },
              { label: 'Screened In', value: jobAnalytics?.totals?.screenedIn, icon: '👍', color: 'emerald' },
              { label: 'In Interview', value: jobAnalytics?.totals?.inInterview, icon: '🎙️', color: 'indigo' },
              { label: 'Hired', value: jobAnalytics?.totals?.hired, icon: '🎉', color: 'orange' }
            ].map((item, idx) => (
              <div
                key={item.label}
                className="card"
                style={{
                  padding: '1.25rem',
                  borderTop: `4px solid ${
                    item.color === 'blue' ? '#3B82F6' :
                    item.color === 'green' ? '#10B981' :
                    item.color === 'purple' ? '#8B5CF6' :
                    item.color === 'orange' ? '#F59E0B' :
                    item.color === 'emerald' ? '#059669' :
                    '#6366F1'
                  }`,
                  animation: `slideUp 0.5s ease ${idx * 0.05}s backwards`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                  <p className="muted" style={{ margin: 0, fontWeight: '600', fontSize: '0.85rem' }}>{item.label}</p>
                </div>
                <h2 style={{ fontSize: '2rem', fontWeight: '700', margin: 0 }}>
                  {loading ? '...' : (item.value ?? 0)}
                </h2>
              </div>
            ))}
          </div>

          {/* Job-wise Analytics Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.08) 0%, rgba(10, 102, 194, 0.02) 100%)',
              borderBottom: '1px solid rgba(10, 102, 194, 0.15)'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📊 Job-wise Analytics
              </h3>
            </div>
            
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <p className="muted">Loading analytics...</p>
              </div>
            ) : jobAnalytics?.jobs?.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <p className="muted">No jobs found. Create a job to see analytics.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(10, 102, 194, 0.05)' }}>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Job Title</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Applications</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Pending</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb', color: '#059669' }}>✅ Screened In</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb', color: '#DC2626' }}>❌ Screened Out</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb', color: '#8B5CF6' }}>📝 Assessment</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb', color: '#6366F1' }}>🎙️ Interview</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb', color: '#F59E0B' }}>📨 Offer</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb', color: '#10B981' }}>🎉 Hired</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobAnalytics?.jobs?.map((job, idx) => (
                      <tr 
                        key={job.jobId} 
                        style={{ 
                          borderBottom: '1px solid #f3f4f6',
                          animation: `slideUp 0.3s ease ${idx * 0.05}s backwards`
                        }}
                      >
                        <td style={{ padding: '1rem' }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: '600' }}>{job.title}</p>
                            <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{job.location || 'Remote'}</p>
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: job.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                            color: job.status === 'active' ? '#059669' : '#6B7280'
                          }}>
                            {job.status}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontWeight: '700', fontSize: '1.1rem' }}>{job.metrics.total}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#6B7280' }}>{job.metrics.pending}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#059669', fontWeight: '600' }}>{job.metrics.screenedIn}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#DC2626' }}>{job.metrics.screenedOut}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#8B5CF6' }}>{job.metrics.inAssessment}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#6366F1' }}>{job.metrics.inInterview}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#F59E0B' }}>{job.metrics.inOffer}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#10B981', fontWeight: '600' }}>{job.metrics.hired}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <Link 
                            to={`/recruitment?jobId=${job.jobId}`}
                            style={{
                              padding: '0.4rem 0.8rem',
                              background: 'var(--primary)',
                              color: 'white',
                              borderRadius: 'var(--radius)',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              textDecoration: 'none'
                            }}
                          >
                            Manage
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals Row */}
                  <tfoot>
                    <tr style={{ background: 'rgba(10, 102, 194, 0.05)', fontWeight: '700' }}>
                      <td style={{ padding: '1rem' }}>TOTAL ({jobAnalytics?.totalJobs} jobs)</td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>-</td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontSize: '1.1rem' }}>{jobAnalytics?.totals?.total}</td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>{jobAnalytics?.totals?.pending}</td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#059669' }}>{jobAnalytics?.totals?.screenedIn}</td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#DC2626' }}>{jobAnalytics?.totals?.screenedOut}</td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#8B5CF6' }}>{jobAnalytics?.totals?.inAssessment}</td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#6366F1' }}>{jobAnalytics?.totals?.inInterview}</td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#F59E0B' }}>{jobAnalytics?.totals?.inOffer}</td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#10B981' }}>{jobAnalytics?.totals?.hired}</td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Candidate Metrics Grid */}
      {isCandidate && (
        <div className="card-grid" style={{ 
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          marginBottom: '1.5rem'
        }}>
          {candidateCards.map((item, idx) => (
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
                  '#F59E0B'
                }`,
                animation: `slideUp 0.5s ease ${idx * 0.1}s backwards`
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
                background: item.color === 'blue' ? 'rgba(59, 130, 246, 0.1)' :
                  item.color === 'green' ? 'rgba(16, 185, 129, 0.1)' :
                  item.color === 'purple' ? 'rgba(139, 92, 246, 0.1)' :
                  'rgba(245, 158, 11, 0.1)'
              }}>
                {item.icon}
              </div>
              <p className="muted" style={{ marginBottom: '0.5rem', fontWeight: '600' }}>
                {item.label}
              </p>
              <h2 style={{ fontSize: '2.5rem', fontWeight: '700', margin: 0 }}>
                {loading ? '...' : (item.value ?? 0)}
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