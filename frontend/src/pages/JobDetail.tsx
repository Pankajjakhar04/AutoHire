import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkJobEligibility, fetchJob, Job, type EligibilityCheckResult } from '../services/jobs';
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

function formatEducationLevel(level?: string): string {
  if (!level) return '';
  const mapping: { [key: string]: string } = {
    highSchool: 'High School',
    diploma: 'Diploma',
    bachelors: "Bachelor's",
    masters: "Master's",
    phd: 'PhD'
  };
  return mapping[level] || level;
}

const specializationOptions = [
  'Computer Science',
  'Information Technology',
  'Electronics',
  'Mechanical',
  'Civil',
  'Business Administration',
  'Commerce',
  'Arts',
  'Science'
];

const qualificationOptions = [
  'Engineering',
  'MBA',
  'BSc',
  'MSc',
  'CA',
  'CFA',
  'PG Diploma'
];

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
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [eligibilityChecking, setEligibilityChecking] = useState(false);
  const [eligibilityError, setEligibilityError] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityCheckResult | null>(null);
  const [eligibilityForm, setEligibilityForm] = useState<{
    educationLevel: '' | 'highSchool' | 'diploma' | 'bachelors' | 'masters' | 'phd';
    specialization: string;
    academicQualification: string;
    experienceYears: string;
  }>({
    educationLevel: '',
    specialization: '',
    academicQualification: '',
    experienceYears: ''
  });
  const [specializationOther, setSpecializationOther] = useState(false);
  const [qualificationOther, setQualificationOther] = useState(false);
  const [customCriteriaAccepted, setCustomCriteriaAccepted] = useState<number[]>([]);

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
      setUploadSuccess('Application submitted successfully! A confirmation email has been sent.');
      setFile(null);
      setResumes((prev) => [uploaded, ...prev]);
    } catch (err: any) {
      setUploadError(err?.response?.data?.message || 'Application failed');
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

  const criteria = job.eligibilityCriteria;
  const educationLevels = Array.isArray(criteria?.educationMinLevel) 
    ? criteria.educationMinLevel 
    : criteria?.educationMinLevel 
      ? [criteria.educationMinLevel] 
      : [];
  const hasCriteria =
    educationLevels.length > 0 ||
    Boolean(criteria?.specialization) ||
    Boolean(criteria?.academicQualification) ||
    criteria?.minExperienceYears !== undefined ||
    (criteria?.customCriteria && criteria.customCriteria.length > 0);

  const openEligibility = () => {
    setEligibilityError('');
    setEligibilityResult(null);
    setCustomCriteriaAccepted([]);
    setSpecializationOther(false);
    setQualificationOther(false);
    setEligibilityForm({
      educationLevel: '',
      specialization: '',
      academicQualification: '',
      experienceYears: ''
    });
    setEligibilityOpen(true);
  };

  const closeEligibility = () => {
    setEligibilityOpen(false);
    setEligibilityError('');
  };

  const toggleCustomCriterion = (idx: number) => {
    setCustomCriteriaAccepted((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  const validateEligibilityInput = () => {
    const missing: string[] = [];
    if (educationLevels.length > 0 && !eligibilityForm.educationLevel) missing.push('Education level');
    if (criteria?.minExperienceYears !== undefined && eligibilityForm.experienceYears.trim() === '') missing.push('Years of experience');
    if (criteria?.specialization && eligibilityForm.specialization.trim() === '') missing.push('Specialization / Stream');
    if (criteria?.academicQualification && eligibilityForm.academicQualification.trim() === '') missing.push('Academic qualification');
    const custom = criteria?.customCriteria || [];
    if (custom.length > 0 && customCriteriaAccepted.length !== custom.length) missing.push('Custom criteria confirmations');
    return missing;
  };

  const runEligibilityCheck = async () => {
    if (!id) return;
    setEligibilityError('');
    setEligibilityResult(null);

    const missing = validateEligibilityInput();
    if (missing.length > 0) {
      setEligibilityError(`Please provide: ${missing.join(', ')}`);
      return;
    }

    const expRaw = eligibilityForm.experienceYears.trim();
    const expNum = expRaw === '' ? undefined : Number(expRaw);
    if (expNum !== undefined && (Number.isNaN(expNum) || expNum < 0)) {
      setEligibilityError('Experience must be a valid non-negative number.');
      return;
    }

    setEligibilityChecking(true);
    try {
      const result = await checkJobEligibility(id, {
        educationLevel: (eligibilityForm.educationLevel || undefined) as 'highSchool' | 'diploma' | 'bachelors' | 'masters' | 'phd' | undefined,
        specialization: eligibilityForm.specialization.trim() || undefined,
        academicQualification: eligibilityForm.academicQualification.trim() || undefined,
        experienceYears: expNum,
        customCriteriaAccepted: customCriteriaAccepted
      });
      setEligibilityResult(result);
    } catch (err: any) {
      setEligibilityError(err?.response?.data?.message || 'Eligibility check failed');
    } finally {
      setEligibilityChecking(false);
    }
  };

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
          {isCandidate && hasCriteria && <button onClick={openEligibility}>Check Eligibility</button>}
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
        {hasCriteria && (
          <div className="card">
            <h3>Eligibility Criteria</h3>
            <ul className="plain">
              {(() => {
                const educationLevels = Array.isArray(criteria?.educationMinLevel) 
                  ? criteria.educationMinLevel 
                  : criteria?.educationMinLevel 
                    ? [criteria.educationMinLevel] 
                    : [];
                return educationLevels.length > 0 ? (
                  <li>
                    <strong>Minimum Education:</strong>{' '}
                    {educationLevels.map((level) => formatEducationLevel(level)).join(', ')}
                    <span className="muted" style={{ fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      (Higher degrees satisfy lower requirements)
                    </span>
                  </li>
                ) : null;
              })()}
              {criteria?.minExperienceYears !== undefined && (
                <li><strong>Minimum Experience:</strong> {criteria.minExperienceYears} years</li>
              )}
              {criteria?.specialization && (
                <li><strong>Specialization / Stream:</strong> {criteria.specialization}</li>
              )}
              {criteria?.academicQualification && (
                <li><strong>Academic Qualification:</strong> {criteria.academicQualification}</li>
              )}
              {criteria?.customCriteria && criteria.customCriteria.length > 0 && (
                <li>
                  <strong>Additional Requirements:</strong>
                  <ul style={{ marginTop: '0.5rem', marginLeft: '1.25rem', listStyleType: 'disc' }}>
                    {criteria.customCriteria.map((criterion, idx) => (
                      <li key={idx} style={{ marginBottom: '0.25rem' }}>{criterion}</li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
            {isCandidate && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <button onClick={openEligibility} style={{ width: '100%' }}>
                  Check My Eligibility
                </button>
              </div>
            )}
          </div>
        )}
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
            {isCandidate && eligibilityResult && !eligibilityResult.eligible && (
              <p className="error" style={{ marginTop: '0.25rem' }}>
                {eligibilityResult.warning || 'There is very minimal chance of screening as you are currently ineligible for this position.'}
              </p>
            )}
            {isCandidate && eligibilityResult && eligibilityResult.eligible && (
              <p className="success" style={{ marginTop: '0.25rem' }}>You appear eligible based on the criteria provided.</p>
            )}
            {isCandidate && (
              <div className="resume-upload">
                <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <button onClick={handleUpload}>Apply</button>
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

      {eligibilityOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEligibility();
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Check Eligibility</h3>
                <p className="muted">Enter your details to see if you meet the job’s eligibility criteria.</p>
              </div>
              <button type="button" className="modal-close" onClick={closeEligibility}>Close</button>
            </div>

            {educationLevels.length > 0 && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem' }}>
                Education level (required)
                <select
                  value={eligibilityForm.educationLevel}
                  onChange={(e) => setEligibilityForm((p) => ({ ...p, educationLevel: e.target.value as any }))}
                >
                  <option value="">Select</option>
                  <option value="highSchool">High School</option>
                  <option value="diploma">Diploma</option>
                  <option value="bachelors">Bachelor&apos;s</option>
                  <option value="masters">Master&apos;s</option>
                  <option value="phd">PhD</option>
                </select>
                <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Accepted levels: {educationLevels.map((level) => formatEducationLevel(level)).join(', ')}. Higher degrees satisfy lower requirements.
                </p>
              </label>
            )}

            {criteria?.specialization && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem', marginTop: '0.75rem' }}>
                Specialization / Stream (required)
                <select
                  value={
                    specializationOther || (eligibilityForm.specialization && !specializationOptions.includes(eligibilityForm.specialization))
                      ? 'other'
                      : eligibilityForm.specialization
                  }
                  onChange={(e) => {
                    if (e.target.value === 'other') {
                      setSpecializationOther(true);
                      // Preserve existing custom value if it exists
                      if (!eligibilityForm.specialization || specializationOptions.includes(eligibilityForm.specialization)) {
                        setEligibilityForm((p) => ({ ...p, specialization: '' }));
                      }
                    } else {
                      setSpecializationOther(false);
                      setEligibilityForm((p) => ({ ...p, specialization: e.target.value }));
                    }
                  }}
                >
                  <option value="">Select</option>
                  {specializationOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  <option value="other">Other</option>
                </select>
                {(specializationOther || (eligibilityForm.specialization && !specializationOptions.includes(eligibilityForm.specialization))) && (
                  <input
                    value={eligibilityForm.specialization}
                    onChange={(e) => {
                      setEligibilityForm((p) => ({ ...p, specialization: e.target.value }));
                      // Auto-set other mode if typing custom value
                      if (!specializationOptions.includes(e.target.value)) {
                        setSpecializationOther(true);
                      }
                    }}
                    placeholder="Enter specialization"
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
              </label>
            )}

            {criteria?.minExperienceYears !== undefined && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem', marginTop: '0.75rem' }}>
                Years of experience (required)
                <input
                  type="number"
                  min={0}
                  value={eligibilityForm.experienceYears}
                  onChange={(e) => setEligibilityForm((p) => ({ ...p, experienceYears: e.target.value }))}
                  placeholder="e.g. 2"
                />
              </label>
            )}

            {criteria?.academicQualification && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 600, fontSize: '0.875rem', marginTop: '0.75rem' }}>
                Academic qualification (required)
                <select
                  value={
                    qualificationOther || (eligibilityForm.academicQualification && !qualificationOptions.includes(eligibilityForm.academicQualification))
                      ? 'other'
                      : eligibilityForm.academicQualification
                  }
                  onChange={(e) => {
                    if (e.target.value === 'other') {
                      setQualificationOther(true);
                      // Preserve existing custom value if it exists
                      if (!eligibilityForm.academicQualification || qualificationOptions.includes(eligibilityForm.academicQualification)) {
                        setEligibilityForm((p) => ({ ...p, academicQualification: '' }));
                      }
                    } else {
                      setQualificationOther(false);
                      setEligibilityForm((p) => ({ ...p, academicQualification: e.target.value }));
                    }
                  }}
                >
                  <option value="">Select</option>
                  {qualificationOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  <option value="other">Other</option>
                </select>
                {(qualificationOther || (eligibilityForm.academicQualification && !qualificationOptions.includes(eligibilityForm.academicQualification))) && (
                  <input
                    value={eligibilityForm.academicQualification}
                    onChange={(e) => {
                      setEligibilityForm((p) => ({ ...p, academicQualification: e.target.value }));
                      // Auto-set other mode if typing custom value
                      if (!qualificationOptions.includes(e.target.value)) {
                        setQualificationOther(true);
                      }
                    }}
                    placeholder="Enter qualification"
                    style={{ marginTop: '0.5rem' }}
                  />
                )}
              </label>
            )}

            {(criteria?.customCriteria || []).length > 0 && (
              <div style={{ marginTop: '0.9rem' }}>
                <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Custom criteria (confirm all)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(criteria?.customCriteria || []).map((c, idx) => (
                    <label
                      key={`${idx}-${c}`}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.6rem 0.75rem',
                        border: '1px solid rgba(10, 102, 194, 0.15)',
                        borderRadius: '8px',
                        background: 'rgba(10, 102, 194, 0.04)',
                        fontSize: '0.875rem',
                        fontWeight: 500
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={customCriteriaAccepted.includes(idx)}
                        onChange={() => toggleCustomCriterion(idx)}
                        style={{ marginTop: '0.2rem' }}
                      />
                      <span>I meet: {c}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {eligibilityError && <p className="error" style={{ marginTop: '0.75rem' }}>{eligibilityError}</p>}

            {eligibilityResult && eligibilityResult.eligible && (
              <p className="success-message" style={{ marginTop: '0.75rem' }}>
                You meet the eligibility criteria. You can proceed with your application.
              </p>
            )}

            {eligibilityResult && !eligibilityResult.eligible && (
              <div style={{ marginTop: '0.75rem' }}>
                <p className="error" style={{ marginBottom: '0.25rem' }}>
                  {eligibilityResult.warning || 'There is very minimal chance of screening as you are currently ineligible for this position.'}
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  You may still proceed to apply, but please note the warning above.
                </p>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={closeEligibility}>Cancel</button>
              <button type="button" onClick={runEligibilityCheck} disabled={eligibilityChecking}>
                {eligibilityChecking ? 'Checking...' : 'Evaluate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
