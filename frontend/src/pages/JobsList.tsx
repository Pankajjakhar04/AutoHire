import { FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkJobEligibility, deleteJob, fetchJobs, Job, type EligibilityCheckResult } from '../services/jobs';
import { listMyResumes, uploadResume } from '../services/resumes';

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

export default function JobsList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'closed'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const requestSeq = useRef(0);
  const [isPending, startTransition] = useTransition();
  
  // Eligibility check state
  const [eligibilityJobId, setEligibilityJobId] = useState<string | null>(null);
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

  // Apply modal state
  const [applyJobId, setApplyJobId] = useState<string | null>(null);
  const [applyFile, setApplyFile] = useState<File | null>(null);
  const [applyUploading, setApplyUploading] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applySuccess, setApplySuccess] = useState('');
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());

  const isRecruiter = user?.role === 'recruiterAdmin' || user?.role === 'hrManager';
  const isCandidate = user?.role === 'candidate';

  // Load applied job IDs for current candidate once on mount
  useEffect(() => {
    if (!isCandidate) return;
    listMyResumes()
      .then((resumes) => {
        const ids = new Set(resumes.map((r) => {
          const jid = r.jobId;
          return typeof jid === 'string' ? jid : (jid as any)?._id ?? '';
        }).filter(Boolean));
        setAppliedJobIds(ids);
      })
      .catch(() => { /* silent — non-critical */ });
  }, [isCandidate]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const mySeq = ++requestSeq.current;
    const isFirst = initialLoading && jobs.length === 0;
    if (!isFirst) setIsFetching(true);
    setError('');

    (async () => {
      try {
        const data = await fetchJobs({
          q: debouncedQuery || undefined,
          status: status === 'all' ? undefined : status
        });
        if (mySeq !== requestSeq.current) return;
        startTransition(() => setJobs(data));
      } catch (err: any) {
        if (mySeq !== requestSeq.current) return;
        setError(err?.response?.data?.message || 'Failed to load jobs');
      } finally {
        if (mySeq !== requestSeq.current) return;
        setInitialLoading(false);
        setIsFetching(false);
      }
    })();
  }, [debouncedQuery, status]);

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
    setDebouncedQuery(searchInput.trim());
  };

  const openEligibility = (job: Job) => {
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
    
    if (!hasCriteria) {
      alert('This job does not have eligibility criteria configured.');
      return;
    }
    
    setEligibilityJobId(job._id);
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
  };

  const closeEligibility = () => {
    setEligibilityJobId(null);
    setEligibilityError('');
    setEligibilityResult(null);
  };

  const openApplyModal = (jobId: string) => {
    setApplyJobId(jobId);
    setApplyFile(null);
    setApplyError('');
    setApplySuccess('');
  };

  const closeApplyModal = () => {
    setApplyJobId(null);
    setApplyFile(null);
    setApplyError('');
    setApplySuccess('');
  };

  const handleApply = async () => {
    if (!applyJobId || !applyFile) {
      setApplyError('Please select a resume file (PDF, DOC, or DOCX).');
      return;
    }
    setApplyError('');
    setApplyUploading(true);
    try {
      await uploadResume(applyJobId, applyFile);
      setApplySuccess('Application submitted! A confirmation email has been sent.');
      setAppliedJobIds((prev) => new Set(prev).add(applyJobId));
      setApplyFile(null);
    } catch (err: any) {
      setApplyError(err?.response?.data?.message || 'Application failed. Please try again.');
    } finally {
      setApplyUploading(false);
    }
  };

  const toggleCustomCriterion = (idx: number) => {
    setCustomCriteriaAccepted((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  const validateEligibilityInput = (criteria: Job['eligibilityCriteria']) => {
    const missing: string[] = [];
    const educationLevels = Array.isArray(criteria?.educationMinLevel) 
      ? criteria.educationMinLevel 
      : criteria?.educationMinLevel 
        ? [criteria.educationMinLevel] 
        : [];
    if (educationLevels.length > 0 && !eligibilityForm.educationLevel) missing.push('Education level');
    if (criteria?.minExperienceYears !== undefined && eligibilityForm.experienceYears.trim() === '') missing.push('Years of experience');
    if (criteria?.specialization && eligibilityForm.specialization.trim() === '') missing.push('Specialization / Stream');
    if (criteria?.academicQualification && eligibilityForm.academicQualification.trim() === '') missing.push('Academic qualification');
    const custom = criteria?.customCriteria || [];
    if (custom.length > 0 && customCriteriaAccepted.length !== custom.length) missing.push('Custom criteria confirmations');
    return missing;
  };

  const runEligibilityCheck = async () => {
    if (!eligibilityJobId) return;
    setEligibilityError('');
    setEligibilityResult(null);

    const job = jobs.find((j) => j._id === eligibilityJobId);
    if (!job) return;

    const criteria = job.eligibilityCriteria;
    const missing = validateEligibilityInput(criteria);
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
      const result = await checkJobEligibility(eligibilityJobId, {
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

  if (initialLoading && jobs.length === 0 && !error) {
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

  if (error && jobs.length === 0) {
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
          {error && (
            <p className="error" style={{ marginTop: '0.75rem' }}>
              ⚠️ {error}
            </p>
          )}
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
          {(isFetching || isPending) && (
            <span style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '0.8rem',
              color: 'var(--muted)'
            }}>
              Searching…
            </span>
          )}
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
        <button type="submit" style={{ width: '100%' }}>{(isFetching || isPending) ? 'Searching…' : 'Search'}</button>
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
                  {job.companyName && (
                    <p className="muted" style={{
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--primary)'
                    }}>
                      <span>🏢</span> {job.companyName}
                    </p>
                  )}
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
                {isCandidate && (() => {
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
                  
                  return hasCriteria ? (
                    <button
                      onClick={() => openEligibility(job)}
                      style={{
                        padding: '0.6rem 1rem',
                        borderRadius: 'var(--radius)',
                        fontWeight: '600',
                        fontSize: '0.875rem',
                        background: 'rgba(5, 150, 105, 0.1)',
                        color: '#059669',
                        border: '1px solid rgba(5, 150, 105, 0.3)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'inline-block',
                        textAlign: 'center'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(5, 150, 105, 0.2)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(5, 150, 105, 0.1)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      ✓ Check Eligibility
                    </button>
                  ) : null;
                })()}
                {isCandidate && job.status === 'active' && (
                  appliedJobIds.has(job._id) ? (
                    <span
                      style={{
                        padding: '0.6rem 1rem',
                        borderRadius: 'var(--radius)',
                        fontWeight: '600',
                        fontSize: '0.875rem',
                        background: 'rgba(5, 150, 105, 0.12)',
                        color: '#059669',
                        border: '1px solid rgba(5, 150, 105, 0.35)',
                        display: 'inline-block',
                        textAlign: 'center'
                      }}
                    >
                      ✓ Applied
                    </span>
                  ) : (
                    <button
                      onClick={() => openApplyModal(job._id)}
                      style={{
                        padding: '0.6rem 1rem',
                        borderRadius: 'var(--radius)',
                        fontWeight: '600',
                        fontSize: '0.875rem',
                        background: 'linear-gradient(135deg, var(--primary) 0%, #0052a3 100%)',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'inline-block',
                        textAlign: 'center'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(10, 102, 194, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      📄 Apply Now
                    </button>
                  )
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

      {/* Eligibility Check Modal */}
      {eligibilityJobId && (() => {
        const job = jobs.find((j) => j._id === eligibilityJobId);
        if (!job) return null;
        const criteria = job.eligibilityCriteria;
        
        return (
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
                  <h3>Check Eligibility - {job.title}</h3>
                  <p className="muted">Enter your details to see if you meet the job's eligibility criteria.</p>
                </div>
                <button type="button" className="modal-close" onClick={closeEligibility}>Close</button>
              </div>

              {(() => {
                const educationLevels = Array.isArray(criteria?.educationMinLevel) 
                  ? criteria.educationMinLevel 
                  : criteria?.educationMinLevel 
                    ? [criteria.educationMinLevel] 
                    : [];
                return educationLevels.length > 0 ? (
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
                      Accepted levels: {educationLevels.map((level) => {
                        const mapping: { [key: string]: string } = {
                          highSchool: 'High School',
                          diploma: 'Diploma',
                          bachelors: "Bachelor's",
                          masters: "Master's",
                          phd: 'PhD'
                        };
                        return mapping[level] || level;
                      }).join(', ')}. Higher degrees satisfy lower requirements.
                    </p>
                  </label>
                ) : null;
              })()}

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
        );
      })()}

      {/* Apply Modal */}
      {applyJobId && (() => {
        const job = jobs.find((j) => j._id === applyJobId);
        if (!job) return null;
        return (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !applySuccess) closeApplyModal();
            }}
          >
            <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="modal-head">
                <div>
                  <h3>Apply — {job.title}</h3>
                  <p className="muted">Upload your resume to submit your application.</p>
                </div>
                <button type="button" className="modal-close" onClick={closeApplyModal}>Close</button>
              </div>

              {applySuccess ? (
                <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎉</div>
                  <p className="success-message" style={{ fontSize: '1rem', fontWeight: 600 }}>{applySuccess}</p>
                  <p className="muted" style={{ marginTop: '0.5rem' }}>Check your email for confirmation details.</p>
                </div>
              ) : (
                <>
                  <div style={{ marginTop: '0.75rem' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>
                      Resume file (PDF, DOC, or DOCX)
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => {
                          setApplyFile(e.target.files?.[0] || null);
                          setApplyError('');
                        }}
                        style={{ fontWeight: 'normal' }}
                      />
                    </label>
                    {applyFile && (
                      <p className="muted" style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>
                        Selected: {applyFile.name} ({Math.round(applyFile.size / 1024)} KB)
                      </p>
                    )}
                  </div>
                  {applyError && <p className="error" style={{ marginTop: '0.75rem' }}>{applyError}</p>}
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeApplyModal}>
                  {applySuccess ? 'Close' : 'Cancel'}
                </button>
                {!applySuccess && (
                  <button type="button" onClick={handleApply} disabled={applyUploading || !applyFile}>
                    {applyUploading ? 'Submitting...' : 'Submit Application'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}