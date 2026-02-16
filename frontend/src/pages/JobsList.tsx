import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { deleteJob, fetchJobs, Job } from '../services/jobs';

export default function JobsList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'closed'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const isRecruiter = user?.role === 'recruiterAdmin' || user?.role === 'hrManager';

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchJobs({
          q: query || undefined,
          status: status === 'all' ? undefined : status
        });
        setJobs(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load jobs');
      } finally {
        setLoading(false);
      }
    })();
  }, [query, status]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this job?')) return;
    try {
      await deleteJob(id);
      setJobs((prev) => prev.filter((j) => j._id !== id));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Delete failed');
    }
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(searchInput.trim());
  };

  if (loading) {
    return (
      <div className="page">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{
            width: '3rem',
            height: '3rem',
            border: '4px solid rgba(10, 102, 194, 0.2)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p className="muted">Loading jobs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div style={{
          background: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          borderLeft: '4px solid #DC2626',
          borderRadius: 'var(--radius)',
          padding: '1.5rem',
          textAlign: 'center'
        }}>
          <p className="error" style={{ margin: 0, fontSize: '1rem' }}>⚠️ {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.6s ease' }}>
      {/* Header */}
      <div className="page-head" style={{
        background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.08) 0%, rgba(10, 102, 194, 0.02) 100%)',
        borderRadius: 'var(--radius)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(10, 102, 194, 0.15)'
      }}>
        <div>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: '700',
            marginBottom: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <span style={{
              width: '2.5rem',
              height: '2.5rem',
              background: 'rgba(10, 102, 194, 0.15)',
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem'
            }}>💼</span>
            Job openings
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.95rem' }}>
            {jobs.length} {jobs.length === 1 ? 'position' : 'positions'} available
          </p>
        </div>
        {isRecruiter && (
          <button 
            onClick={() => navigate('/jobs/new')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '0.95rem'
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>+</span> New job
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <form 
        className="filters" 
        onSubmit={handleSearchSubmit}
        style={{
          background: 'rgba(255, 255, 255, 0.6)',
          padding: '1.25rem',
          borderRadius: 'var(--radius)',
          border: '1px solid rgba(10, 102, 194, 0.1)',
          marginBottom: '1.5rem'
        }}
      >
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '1.1rem',
            pointerEvents: 'none',
            opacity: 0.5
          }}>🔍</span>
          <input
            placeholder="Search by title or skills"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              paddingLeft: '2.5rem'
            }}
          />
        </div>
        <select 
          value={status} 
          onChange={(e) => setStatus(e.target.value as typeof status)}
          style={{
            background: 'white'
          }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
        <button type="submit" style={{ width: '100%' }}>Search</button>
      </form>

      {/* Job Listings */}
      {jobs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'rgba(10, 102, 194, 0.03)',
          borderRadius: 'var(--radius)',
          border: '1px dashed rgba(10, 102, 194, 0.2)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📭</div>
          <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No jobs found</p>
          <p className="muted">Try adjusting your search filters or check back later</p>
        </div>
      ) : (
        <div className="job-list" style={{ gap: '1rem' }}>
          {jobs.map((job, index) => (
            <div 
              key={job._id} 
              className="job-card"
              style={{
                animation: `slideUp 0.5s ease ${index * 0.1}s backwards`,
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Status indicator */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: job.status === 'active' 
                  ? 'linear-gradient(90deg, #10B981, #059669)' 
                  : 'linear-gradient(90deg, #6B7280, #4B5563)'
              }}></div>

              <div style={{ flex: 1 }}>
                {/* Title and Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>
                    <Link 
                      to={`/jobs/${job._id}`}
                      style={{
                        color: 'var(--text)',
                        textDecoration: 'none',
                        transition: 'color 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text)'}
                    >
                      {job.title}
                    </Link>
                  </h3>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em',
                    background: job.status === 'active' 
                      ? 'rgba(16, 185, 129, 0.15)' 
                      : 'rgba(107, 114, 128, 0.15)',
                    color: job.status === 'active' ? '#059669' : '#4B5563',
                    border: `1px solid ${job.status === 'active' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(107, 114, 128, 0.3)'}`
                  }}>
                    <span style={{ 
                      width: '6px', 
                      height: '6px', 
                      borderRadius: '50%',
                      background: job.status === 'active' ? '#10B981' : '#6B7280'
                    }}></span>
                    {job.status}
                  </span>
                </div>

                {/* Location and Job ID */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <p className="muted" style={{ 
                    margin: 0, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.35rem',
                    fontSize: '0.875rem'
                  }}>
                    <span>📍</span> {job.location || 'Remote/Anywhere'}
                  </p>
                  <p className="muted" style={{ 
                    margin: 0,
                    fontSize: '0.8rem',
                    padding: '0.25rem 0.5rem',
                    background: 'rgba(10, 102, 194, 0.08)',
                    borderRadius: '4px',
                    fontFamily: 'monospace'
                  }}>
                    ID: {(job as any).jobCode || job._id}
                  </p>
                </div>

                {/* Description */}
                <p style={{ 
                  lineHeight: '1.6', 
                  marginBottom: '0.75rem',
                  color: 'var(--muted)'
                }}>
                  {expandedJobId === job._id ? job.description : job.description?.slice(0, 160)}
                  {job.description && job.description.length > 160 && (
                    <>
                      {expandedJobId !== job._id && '…'}
                      <button 
                        onClick={() => setExpandedJobId(expandedJobId === job._id ? null : job._id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          marginLeft: '0.5rem',
                          padding: 0,
                          textDecoration: 'underline',
                          fontSize: '0.875rem'
                        }}
                      >
                        {expandedJobId === job._id ? 'Read less ↑' : 'Read more →'}
                      </button>
                    </>
                  )}
                </p>

                {/* Skills */}
                {job.requiredSkills && job.requiredSkills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                    {job.requiredSkills.map((skill, idx) => (
                      <span 
                        key={idx}
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: 'rgba(10, 102, 194, 0.1)',
                          color: 'var(--primary)',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '500',
                          border: '1px solid rgba(10, 102, 194, 0.2)'
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="job-actions" style={{ gap: '0.5rem' }}>
                {user?.role === 'hrManager' && (
                  <Link 
                    to={`/recruitment?jobId=${job._id}`}
                    style={{
                      padding: '0.6rem 1rem',
                      borderRadius: 'var(--radius)',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      background: 'rgba(139, 92, 246, 0.1)',
                      color: '#8B5CF6',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      textDecoration: 'none',
                      transition: 'all 0.2s ease',
                      display: 'inline-block',
                      textAlign: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    🎯 Recruitment
                  </Link>
                )}
                <Link 
                  to={`/jobs/${job._id}`}
                  style={{
                    padding: '0.6rem 1rem',
                    borderRadius: 'var(--radius)',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    background: 'var(--primary)',
                    color: 'white',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    display: 'inline-block',
                    textAlign: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--primary-strong)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--primary)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  View details →
                </Link>
                {isRecruiter && (
                  <>
                    <Link 
                      to={`/jobs/${job._id}/edit`}
                      style={{
                        padding: '0.6rem 1rem',
                        borderRadius: 'var(--radius)',
                        fontWeight: '600',
                        fontSize: '0.875rem',
                        background: 'white',
                        color: 'var(--primary)',
                        border: '1px solid var(--primary)',
                        textDecoration: 'none',
                        transition: 'all 0.2s ease',
                        display: 'inline-block',
                        textAlign: 'center'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(10, 102, 194, 0.05)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      ✏️ Edit
                    </Link>
                    <button 
                      onClick={() => handleDelete(job._id)}
                      style={{
                        padding: '0.6rem 1rem',
                        fontSize: '0.875rem',
                        background: 'rgba(220, 38, 38, 0.1)',
                        color: '#DC2626',
                        border: '1px solid rgba(220, 38, 38, 0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(220, 38, 38, 0.2)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}