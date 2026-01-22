import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchJob, Job } from '../services/jobs';
import {
  deleteResume,
  downloadResume,
  listMyResumesForJob,
  listResumesForJob,
  Resume,
  uploadResume
} from '../services/resumes';

function formatSalary(range?: { min?: number; max?: number; currency?: string }) {
  if (!range) return 'Not specified';
  const currency = range.currency || 'USD';
  const symbols: { [key: string]: string } = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    AUD: '$',
    CAD: '$',
    SGD: '$',
    JPY: '¥'
  };
  const symbol = symbols[currency] || currency;
  const parts = [] as string[];
  if (range.min !== undefined) parts.push(`${symbol}${range.min.toLocaleString()}`);
  if (range.max !== undefined) parts.push(range.min !== undefined ? `-${symbol}${range.max.toLocaleString()}` : `${symbol}${range.max.toLocaleString()}`);
  if (parts.length === 0) return 'Not specified';
  return parts.join('');
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  const isRecruiter = user?.role === 'recruiterAdmin' || user?.role === 'hrManager';
  const isCandidate = user?.role === 'candidate';

  useEffect(() => {
    if (!id) return;
    (async () => {
      setError('');
      setLoading(true);
      try {
        const data = await fetchJob(id);
        setJob(data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load job');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!id || (!isRecruiter && !isCandidate)) return;
    (async () => {
      setResumeLoading(true);
      try {
        if (isRecruiter) {
          const data = await listResumesForJob(id);
          setResumes(data);
        } else if (isCandidate) {
          const data = await listMyResumesForJob(id);
          setResumes(data);
        }
      } catch (err: any) {
        console.error('Resume fetch error', err);
      } finally {
        setResumeLoading(false);
      }
    })();
  }, [id, isRecruiter, isCandidate]);

  const handleUpload = async () => {
    if (!id || !file) {
      setUploadError('Please select a file');
      return;
    }
    setUploadError('');
    setUploadSuccess('');
    try {
      const uploaded = await uploadResume(id, file);
      setUploadSuccess('Resume uploaded');
      setFile(null);
      setResumes((prev) => [uploaded, ...prev]);
    } catch (err: any) {
      setUploadError(err?.response?.data?.message || 'Upload failed');
    }
  };

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

  const handleDelete = async (idToDelete: string) => {
    if (!confirm('Delete this resume?')) return;
    try {
      await deleteResume(idToDelete);
      setResumes((prev) => prev.filter((r) => r._id !== idToDelete));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Delete failed');
    }
  };

  if (loading) return <div className="page"><p>Loading job...</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!job) return <div className="page"><p className="error">Job not found.</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="muted">{job.status?.toUpperCase()}</p>
          <h1>{job.title}</h1>
          <p className="muted">{job.location || 'Remote/Anywhere'}</p>
        </div>
        <div className="actions">
          <button onClick={() => navigate(-1)}>Back</button>
          {isRecruiter && <Link className="btn" to={`/jobs/${job._id}/edit`}>Edit</Link>}
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <h3>Overview</h3>
          <p>{job.description}</p>
        </div>
        <div className="card">
          <h3>Details</h3>
          <ul className="plain">
            <li><strong>Job ID:</strong> {(job as any).jobCode || job._id}</li>
            <li><strong>Location:</strong> {job.location || 'Remote/Anywhere'}</li>
            <li><strong>Experience:</strong> {job.experienceYears !== undefined ? `${job.experienceYears} years` : 'Not specified'}</li>
            <li><strong>Salary:</strong> {formatSalary(job.salaryRange)}</li>
            <li><strong>Status:</strong> {job.status || 'active'}</li>
          </ul>
        </div>
        <div className="card">
          <h3>Skills</h3>
          {job.requiredSkills && job.requiredSkills.length > 0 ? (
            <p><strong>Required:</strong> {job.requiredSkills.join(', ')}</p>
          ) : (
            <p className="muted">No required skills listed.</p>
          )}
          {job.niceToHaveSkills && job.niceToHaveSkills.length > 0 ? (
            <p><strong>Nice to have:</strong> {job.niceToHaveSkills.join(', ')}</p>
          ) : (
            <p className="muted">No nice-to-have skills listed.</p>
          )}
        </div>
        {(isRecruiter || isCandidate) && (
          <div className="card">
            <h3>Resumes</h3>
            {isCandidate && (
              <div className="resume-upload">
                <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <button onClick={handleUpload}>Upload resume</button>
                {uploadError && <p className="error">{uploadError}</p>}
                {uploadSuccess && <p className="success">{uploadSuccess}</p>}
              </div>
            )}
            {resumeLoading ? (
              <p className="muted">Loading resumes...</p>
            ) : resumes.length === 0 ? (
              <p className="muted">No resumes yet.</p>
            ) : (
              <div className="resume-list">
                {resumes.map((r) => (
                  <div key={r._id} className="resume-row">
                    <div>
                      <p><strong>{r.originalName || r.fileName}</strong></p>
                      <p className="muted">{new Date(r.createdAt || '').toLocaleString()} · {Math.round(r.fileSize / 1024)} KB · {r.status}</p>
                    </div>
                    <div className="resume-actions">
                      <button onClick={() => handleDownload(r)}>Download</button>
                      {(isRecruiter || isCandidate) && <button onClick={() => handleDelete(r._id)}>Delete</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
