import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchJobs, Job } from '../services/jobs';
import { listResumesForJob, Resume } from '../services/resumes';

const steps = [
  { key: 'screening', title: 'Resume Screening', description: 'Review resumes, screen in/out, or run AI screening.' },
  { key: 'assessment', title: 'Assessment Shortlisting', description: 'Coming soon.' },
  { key: 'interview', title: 'Interview Shortlisting', description: 'Coming soon.' },
  { key: 'offer', title: 'Offer Release', description: 'Coming soon.' }
] as const;

type StepKey = typeof steps[number]['key'];

type StatusFilter = 'all' | 'uploaded' | 'screened-in' | 'screened-out';

export default function RecruitmentProcess() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const jobIdFromUrl = searchParams.get('jobId');
  const [selectedStep, setSelectedStep] = useState<StepKey>('screening');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingResumes, setLoadingResumes] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const stepsRef = useRef<HTMLDivElement>(null);
  const [bubbleStyle, setBubbleStyle] = useState({ top: 0, height: 0 });

  const isHr = user?.role === 'hrManager' || user?.role === 'recruiterAdmin';

  useEffect(() => {
    if (!stepsRef.current) return;

    const updateBubblePosition = () => {
      const activeStep = stepsRef.current?.querySelector('.process-step.active') as HTMLElement;
      if (activeStep) {
        const top = activeStep.offsetTop;
        const height = activeStep.offsetHeight;
        setBubbleStyle({ top, height });
      }
    };

    updateBubblePosition();
    window.addEventListener('resize', updateBubblePosition);
    return () => window.removeEventListener('resize', updateBubblePosition);
  }, [selectedStep]);

  useEffect(() => {
    if (!isHr) return;
    (async () => {
      setLoadingJobs(true);
      try {
        const data = await fetchJobs({});
        setJobs(data);
        
        // Auto-select job from URL parameter if provided
        if (jobIdFromUrl) {
          const jobExists = data.find(j => j._id === jobIdFromUrl);
          if (jobExists) {
            setSelectedJobId(jobIdFromUrl);
          } else if (data.length > 0) {
            setSelectedJobId(data[0]._id);
          }
        } else if (data.length > 0) {
          setSelectedJobId(data[0]._id);
        }
      } finally {
        setLoadingJobs(false);
      }
    })();
  }, [isHr, jobIdFromUrl]);

  useEffect(() => {
    if (!selectedJobId) return;
    (async () => {
      setLoadingResumes(true);
      try {
        const data = await listResumesForJob(selectedJobId);
        setResumes(data);
        setSelectedIds(new Set());
      } finally {
        setLoadingResumes(false);
      }
    })();
  }, [selectedJobId]);

  const filteredResumes = useMemo(() => {
    const term = search.toLowerCase();
    return resumes.filter((r) => {
      const matchesSearch = !term ||
        r.originalName?.toLowerCase().includes(term) ||
        r.fileName.toLowerCase().includes(term) ||
        (r as any).candidateId?.toString()?.toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [resumes, search, statusFilter]);

  const allVisibleSelected = filteredResumes.length > 0 && filteredResumes.every((r) => selectedIds.has(r._id));

  const toggleAll = (checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      filteredResumes.forEach((r) => next.add(r._id));
    } else {
      filteredResumes.forEach((r) => next.delete(r._id));
    }
    setSelectedIds(next);
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    setSelectedIds(next);
  };

  const handleScreen = (action: 'in' | 'out') => {
    if (selectedIds.size === 0) return alert('Select at least one candidate');
    alert(`Marking ${selectedIds.size} candidate(s) as screen ${action}. (Hook up to backend as needed.)`);
  };

  const handleAIScreen = () => {
    alert('AI Screening (n8n) trigger placeholder. Connect to your N8N webhook here.');
  };

  if (!isHr) {
    return (
      <div className="page">
        <h1>Recruitment process</h1>
        <p className="muted">Only HR Managers and Recruiter Admins can access this section.</p>
      </div>
    );
  }

  return (
    <div className="page process-layout">
      <aside className="process-sidebar">
        <h3>Steps</h3>
        <div className="process-steps" ref={stepsRef}>
          <div 
            className="steps-bubble"
            style={{
              top: `${bubbleStyle.top}px`,
              height: `${bubbleStyle.height}px`
            }}
          />
          {steps.map((s) => (
            <button
              key={s.key}
              className={selectedStep === s.key ? 'process-step active' : 'process-step'}
              onClick={() => setSelectedStep(s.key)}
            >
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="process-main">
        <div className="process-head">
          <div>
            <p className="muted">Recruitment process</p>
            <h2>{steps.find((s) => s.key === selectedStep)?.title}</h2>
          </div>
          <div className="process-actions">
            <label className="job-select">
              <span className="muted">Job</span>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                disabled={loadingJobs || jobs.length === 0}
              >
                {jobs.map((j) => (
                  <option key={j._id} value={j._id}>{j.title}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {selectedStep === 'screening' ? (
          <div className="screening-panel">
            <div className="screening-toolbar">
              <input
                placeholder="Search candidate, file name, or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">All statuses</option>
                <option value="uploaded">Uploaded</option>
                <option value="screened-in">Screened in</option>
                <option value="screened-out">Screened out</option>
              </select>
              <div className="toolbar-actions">
                <button className="btn-success" onClick={() => handleScreen('in')}>Screen in</button>
                <button className="btn-danger" onClick={() => handleScreen('out')}>Screen out</button>
                <button onClick={handleAIScreen}>AI Screening</button>
              </div>
            </div>

            {loadingResumes ? (
              <p className="muted">Loading candidates...</p>
            ) : filteredResumes.length === 0 ? (
              <p className="muted">No candidates found for this job.</p>
            ) : (
              <div className="table screening-table">
                <div className="table-header">
                  <span>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </span>
                  <span>ID</span>
                  <span>Name</span>
                  <span>Email</span>
                  <span>Highest Qualification</span>
                  <span>Profile Score</span>
                  <span>CGPA</span>
                  <span>College</span>
                  <span>Submission Time</span>
                  <span>Actions</span>
                </div>
                {filteredResumes.map((r) => (
                  <div key={r._id} className="table-row">
                    <span>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r._id)}
                        onChange={(e) => toggleOne(r._id, e.target.checked)}
                      />
                    </span>
                    <span>{(r as any).candidateId || '-'}</span>
                    <span>{(r as any).candidateName || (r as any).name || '-'}</span>
                    <span>{(r as any).candidateEmail || (r as any).email || '-'}</span>
                    <span>{(r as any).highestQualification || '-'}</span>
                    <span>{r.score !== undefined ? r.score.toFixed(2) : '-'}</span>
                    <span>{(r as any).cgpa || '-'}</span>
                    <span>{(r as any).college || '-'}</span>
                    <span>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</span>
                    <span className="row-actions">
                      <button className="btn-success" onClick={() => handleScreen('in')}>Screen In</button>
                      <button className="btn-danger" onClick={() => handleScreen('out')}>Screen Out</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            color: '#059669',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {steps.find((s) => s.key === selectedStep)?.description}
          </div>
        )}
      </section>
    </div>
  );
}
