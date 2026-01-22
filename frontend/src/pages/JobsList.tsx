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

  if (loading) return <div className="page"><p>Loading jobs...</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Job openings</h1>
        {isRecruiter && <button onClick={() => navigate('/jobs/new')}>New job</button>}
      </div>
      <form className="filters" onSubmit={handleSearchSubmit}>
        <input
          placeholder="Search by title or skills"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
        <button type="submit">Search</button>
      </form>
      {jobs.length === 0 ? (
        <p>No jobs yet.</p>
      ) : (
        <div className="job-list">
          {jobs.map((job) => (
            <div key={job._id} className="job-card">
              <div>
                <h3><Link to={`/jobs/${job._id}`}>{job.title}</Link></h3>
                <p className="muted">{job.location || 'Remote/Anywhere'} · {job.status}</p>
                <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Job ID: {(job as any).jobCode || job._id}</p>
                <p>
                  {expandedJobId === job._id ? job.description : job.description?.slice(0, 160)}
                  {job.description && job.description.length > 160 && (
                    <>
                      {expandedJobId !== job._id && '…'}
                      <button 
                        onClick={() => setExpandedJobId(expandedJobId === job._id ? null : job._id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0A66C2',
                          cursor: 'pointer',
                          fontWeight: 600,
                          marginLeft: '0.5rem',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                      >
                        {expandedJobId === job._id ? 'Read less' : 'Read more'}
                      </button>
                    </>
                  )}
                </p>
                {job.requiredSkills && job.requiredSkills.length > 0 && (
                  <p className="muted">Skills: {job.requiredSkills.join(', ')}</p>
                )}
              </div>
              <div className="job-actions">
                {user?.role === 'hrManager' && (
                  <Link to={`/recruitment?jobId=${job._id}`}>Recruitment process</Link>
                )}
                <Link to={`/jobs/${job._id}`}>View</Link>
                {isRecruiter && (
                  <>
                    <Link to={`/jobs/${job._id}/edit`}>Edit</Link>
                    <button onClick={() => handleDelete(job._id)}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

