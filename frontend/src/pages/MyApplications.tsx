import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteResume, downloadResume, listMyResumes, Resume } from '../services/resumes';

export default function MyApplications() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await listMyResumes();
        setResumes(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load applications');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDownload = async (resume: Resume) => {
    try {
      const blob = await downloadResume(resume._id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resume.originalName || resume.fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Download failed');
    }
  };

  const handleViewResume = async (resume: Resume) => {
    try {
      const blob = await downloadResume(resume._id);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'View failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this resume?')) return;
    try {
      await deleteResume(id);
      setResumes((prev) => prev.filter((r) => r._id !== id));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Delete failed');
    }
  };

  if (loading) return <div className="page"><p>Loading applications...</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <h1>My applications</h1>
      </div>
      {resumes.length === 0 ? (
        <p className="muted">No applications yet.</p>
      ) : (
        <div className="table">
          <div className="table-header">
            <span>Job</span>
            <span>Job ID</span>
            <span>Uploaded</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {resumes.map((r) => (
            <div key={r._id} className="table-row">
              <span>
                {(() => {
                  const jobDoc = typeof r.jobId === 'string' ? (r.populatedJobId || r.job) : r.jobId;
                  const jobId = typeof r.jobId === 'string' ? r.jobId : r.jobId?._id;
                  const title = jobDoc?.title || 'Job';
                  if (!jobId) return title;
                  return (
                    <Link to={`/jobs/${jobId}`} style={{ cursor: 'pointer', color: '#2563eb' }}>
                      {title}
                    </Link>
                  );
                })()}
              </span>
              <span>
                {(() => {
                  const jobDoc = typeof r.jobId === 'string' ? (r.populatedJobId || r.job) : r.jobId;
                  const jobId = typeof r.jobId === 'string' ? r.jobId : r.jobId?._id;
                  return jobDoc?.jobCode || jobId || '-';
                })()}
              </span>
              <span>{new Date(r.createdAt || '').toLocaleString()}</span>
              <span>{r.status}</span>
              <span className="row-actions">
                <button onClick={() => handleDownload(r)}>Download resume</button>
                <button className="btn-danger" onClick={() => handleDelete(r._id)} style={{ whiteSpace: 'nowrap' }}>Withdraw</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
