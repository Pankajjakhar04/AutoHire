import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchJobs, Job } from '../services/jobs';
import {
  listResumesForJob,
  Resume,
  screenResumes,
  getAiScreenProgress,
  startAiScreenResumes,
  advanceCandidates,
  listResumesByStage,
  exportStageToExcel,
  deleteResume
} from '../services/resumes';

const steps = [
  { key: 'screening', title: 'Resume Screening', icon: '📄', description: 'Review resumes, screen in/out, or run AI screening.', nextStage: 'assessment' },
  { key: 'assessment', title: 'Assessment Shortlisting', icon: '📝', description: 'Shortlist candidates for interviews based on assessment.', nextStage: 'interview' },
  { key: 'interview', title: 'Interview Shortlisting', icon: '🎤', description: 'Select candidates for offer after interview rounds.', nextStage: 'offer' },
  { key: 'offer', title: 'Offer Release', icon: '🎉', description: 'Release offers to selected candidates.', nextStage: 'hired' }
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
  const stepRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState<{ total: number; processed: number; percent: number } | null>(null);
  const [targetScore, setTargetScore] = useState<number>(60);

  // Stage-specific state
  const [stageResumes, setStageResumes] = useState<Resume[]>([]);
  const [loadingStage, setLoadingStage] = useState(false);
  const [stageSearch, setStageSearch] = useState('');
  const [stageSelectedIds, setStageSelectedIds] = useState<Set<string>>(new Set());
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [stageMessage, setStageMessage] = useState<string | null>(null);

  const isHr = user?.role === 'hrManager' || user?.role === 'recruiterAdmin';

  // Calculate bubble position based on active step
  const bubbleStyle = useMemo(() => {
    const activeButton = stepRefs.current[selectedStep];
    if (!activeButton || !stepsRef.current) {
      return { top: 0, height: 0 };
    }
    
    const containerRect = stepsRef.current.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    
    return {
      top: buttonRect.top - containerRect.top,
      height: buttonRect.height
    };
  }, [selectedStep]);

  useEffect(() => {
    if (!isHr) return;
    (async () => {
      setLoadingJobs(true);
      try {
        const data = await fetchJobs({});
        setJobs(data);
        
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

  useEffect(() => {
    if (!selectedJobId || selectedStep === 'screening') return;
    (async () => {
      setLoadingStage(true);
      setStageSelectedIds(new Set());
      setStageMessage(null);
      try {
        const data = await listResumesByStage(selectedJobId, selectedStep);
        setStageResumes(data);
      } catch {
        setStageResumes([]);
      } finally {
        setLoadingStage(false);
      }
    })();
  }, [selectedJobId, selectedStep]);

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

  const handleScreen = async (action: 'in' | 'out') => {
    if (selectedIds.size === 0) return alert('Select at least one candidate');
    const status = action === 'in' ? 'screened-in' : 'screened-out';
    try {
      await screenResumes(Array.from(selectedIds), status as 'screened-in' | 'screened-out');
      setResumes(prev => prev.map(r => selectedIds.has(r._id) ? { ...r, status } as Resume : r));
      setSelectedIds(new Set());
    } catch (err: any) {
      alert(err?.response?.data?.message || `Failed to screen ${action}`);
    }
  };

  const handleSingleScreen = async (resumeId: string, action: 'in' | 'out') => {
    const status = action === 'in' ? 'screened-in' : 'screened-out';
    try {
      await screenResumes([resumeId], status as 'screened-in' | 'screened-out');
      setResumes(prev => prev.map(r => r._id === resumeId ? { ...r, status } as Resume : r));
    } catch (err: any) {
      alert(err?.response?.data?.message || `Failed to screen ${action}`);
    }
  };

  const handleAIScreen = async () => {
    if (!selectedJobId) return alert('Select a job first');
    setAiLoading(true);
    setAiResult(null);
    setAiProgress(null);
    try {
      const idsToScreen = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const started = await startAiScreenResumes(selectedJobId, idsToScreen, targetScore);

      // Poll progress until done
      let done = false;
      while (!done) {
        const p = await getAiScreenProgress(started.runId);
        setAiProgress({ total: p.total, processed: p.processed, percent: p.percent });
        if (p.error) throw new Error(p.error);
        done = p.done;
        if (!done) await new Promise((r) => setTimeout(r, 900));
      }

      const updatedResumes = await listResumesForJob(selectedJobId);
      setResumes(updatedResumes);
      setSelectedIds(new Set());
      setAiResult(`AI Screening complete: updated ${updatedResumes.length} resume(s).`);
      setTimeout(() => setAiResult(null), 6000);
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || 'AI Screening failed');
    } finally {
      setAiLoading(false);
    }
  };

  if (!isHr) {
    return (
      <div className="page">
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'rgba(220, 38, 38, 0.05)',
          borderRadius: 'var(--radius)',
          border: '1px solid rgba(220, 38, 38, 0.2)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h1 style={{ marginBottom: '0.5rem' }}>Access Restricted</h1>
          <p className="muted">Only HR Managers and Recruiter Admins can access this section.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.6s ease' }}>
      <div className="page" style={{ 
        display: 'grid', 
        gridTemplateColumns: '220px minmax(0, 1fr)', 
        gap: 0,
        padding: 0,
        background: 'transparent'
      }}>
        <aside className="process-sidebar" style={{ 
          minHeight: '600px',
          width: '220px'
        }}>
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.1) 0%, rgba(10, 102, 194, 0.05) 100%)',
            borderRadius: 'var(--radius)',
            border: '1px solid rgba(10, 102, 194, 0.2)'
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: '0.85rem',
              color: 'var(--primary)',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              🎯 PIPELINE STEPS
            </h3>
          </div>
          
          <div className="process-steps" ref={stepsRef} style={{ position: 'relative' }}>
            <div 
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${bubbleStyle.top}px`,
                height: `${bubbleStyle.height}px`,
                background: 'rgba(10, 102, 194, 0.25)',
                backdropFilter: 'blur(10px)',
                borderRadius: '6px',
                border: '1px solid rgba(10, 102, 194, 0.4)',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                pointerEvents: 'none',
                boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.4), inset 0 -1px 2px rgba(10, 102, 194, 0.1)',
                zIndex: 1
              }}
            />
            
            {steps.map((s) => (
              <button
                key={s.key}
                ref={(el) => { stepRefs.current[s.key] = el; }}
                onClick={() => setSelectedStep(s.key)}
                style={{
                  position: 'relative',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  textAlign: 'left',
                  width: '100%',
                  whiteSpace: 'normal',
                  lineHeight: '1.3',
                  padding: '0.85rem 1rem',
                  background: 'transparent',
                  border: '1px solid rgba(10, 102, 194, 0.15)',
                  borderRadius: '6px',
                  marginBottom: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontSize: '0.875rem',
                  fontWeight: selectedStep === s.key ? '600' : '500',
                  color: selectedStep === s.key ? '#0A66C2' : '#1F2937',
                  fontFamily: 'inherit',
                  minHeight: '52px'
                }}
              >
                <span style={{ 
                  fontSize: '1.3rem',
                  flexShrink: 0,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  {s.icon}
                </span>
                <span style={{ 
                  flex: 1,
                  wordWrap: 'break-word',
                  overflow: 'hidden'
                }}>
                  {s.title}
                </span>
              </button>
            ))}
          </div>

          {/* Progress Indicator */}
          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            background: 'rgba(10, 102, 194, 0.05)',
            borderRadius: 'var(--radius)',
            border: '1px solid rgba(10, 102, 194, 0.1)'
          }}>
            <p className="muted" style={{ 
              fontSize: '0.7rem', 
              marginBottom: '0.5rem', 
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              PROGRESS
            </p>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem'
            }}>
              <div style={{
                flex: 1,
                height: '6px',
                background: 'rgba(10, 102, 194, 0.15)',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${((steps.findIndex(s => s.key === selectedStep) + 1) / steps.length) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--primary), var(--primary-strong))',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'var(--primary)',
              fontWeight: '600',
              margin: 0
            }}>
              Step {steps.findIndex(s => s.key === selectedStep) + 1} of {steps.length}
            </p>
          </div>
        </aside>

        <section className="process-main">
          {/* Enhanced Header */}
          <div className="process-head" style={{
            background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.08) 0%, rgba(10, 102, 194, 0.02) 100%)',
            borderRadius: 'var(--radius)',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            border: '1px solid rgba(10, 102, 194, 0.15)'
          }}>
            <div>
              <p className="muted" style={{ 
                fontSize: '0.75rem', 
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem'
              }}>
                RECRUITMENT PROCESS
              </p>
              <h2 style={{ 
                margin: 0, 
                fontSize: '1.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>{steps.find((s) => s.key === selectedStep)?.icon}</span>
                {steps.find((s) => s.key === selectedStep)?.title}
              </h2>
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                {steps.find((s) => s.key === selectedStep)?.description}
              </p>
            </div>
            <div className="process-actions">
              <label className="job-select" style={{
                background: 'white',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius)',
                border: '1px solid rgba(10, 102, 194, 0.2)'
              }}>
                <span className="muted" style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  display: 'block',
                  marginBottom: '0.35rem'
                }}>
                  SELECT JOB
                </span>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  disabled={loadingJobs || jobs.length === 0}
                  style={{
                    width: '100%',
                    minWidth: '250px',
                    padding: '0.5rem',
                    fontSize: '0.9rem',
                    fontWeight: '600'
                  }}
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
              {/* Toolbar */}
              <div className="screening-toolbar" style={{
                background: 'rgba(255, 255, 255, 0.6)',
                padding: '1.25rem',
                borderRadius: 'var(--radius)',
                border: '1px solid rgba(10, 102, 194, 0.1)',
                marginBottom: '1.25rem',
                gap: '0.75rem'
              }}>
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
                    placeholder="Search candidate, file name, or ID"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
                <select 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  style={{ background: 'white' }}
                >
                  <option value="all">All statuses</option>
                  <option value="uploaded">Uploaded</option>
                  <option value="screened-in">Screened in</option>
                  <option value="screened-out">Screened out</option>
                </select>
                <label style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  background: 'white',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid rgba(139, 92, 246, 0.3)'
                }}>
                  <span style={{ 
                    fontSize: '0.65rem', 
                    fontWeight: '600',
                    color: '#7C3AED',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Target Score
                  </span>
                  <select
                    value={targetScore}
                    onChange={(e) => setTargetScore(Number(e.target.value))}
                    style={{ 
                      background: 'transparent',
                      border: 'none',
                      fontWeight: '600',
                      fontSize: '0.9rem',
                      color: '#7C3AED',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    <option value={50}>≥ 50</option>
                    <option value={60}>≥ 60</option>
                    <option value={70}>≥ 70</option>
                    <option value={80}>≥ 80</option>
                  </select>
                </label>
                <div className="toolbar-actions" style={{
                  display: 'flex', 
                  gap: '0.5rem', 
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}>
                  <button 
                    className="btn-success" 
                    onClick={() => handleScreen('in')}
                    disabled={selectedIds.size === 0}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.875rem',
                      padding: '0.6rem 1rem'
                    }}
                  >
                    ✓ Screen in {selectedIds.size > 0 && `(${selectedIds.size})`}
                  </button>
                  <button 
                    className="btn-danger" 
                    onClick={() => handleScreen('out')}
                    disabled={selectedIds.size === 0}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.875rem',
                      padding: '0.6rem 1rem'
                    }}
                  >
                    ✗ Screen out {selectedIds.size > 0 && `(${selectedIds.size})`}
                  </button>
                  <button 
                    onClick={handleAIScreen} 
                    disabled={aiLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                      fontSize: '0.875rem',
                      padding: '0.6rem 1rem'
                    }}
                  >
                    {aiLoading ? '⏳ Screening...' : `🤖 ${selectedIds.size > 0 ? `AI Screen (${selectedIds.size})` : 'AI Screen All'}`}
                  </button>
                  <button
                    className="btn-success"
                    onClick={async () => {
                      const allScreenedInIds = filteredResumes.filter(r => r.status === 'screened-in').map(r => r._id);
                      if (allScreenedInIds.length === 0) return alert('No screened-in candidates to advance');
                      if (!confirm(`Move all ${allScreenedInIds.length} screened-in candidate(s) to Assessment?`)) return;
                      try {
                        const result = await advanceCandidates(allScreenedInIds, 'assessment');
                        setAiResult(`${result.message} | Emails: ${result.emailsSent}`);
                        const updated = await listResumesForJob(selectedJobId);
                        setResumes(updated);
                        setSelectedIds(new Set());
                        setTimeout(() => setAiResult(null), 6000);
                      } catch (err: any) {
                        alert(err?.response?.data?.message || 'Failed to advance');
                      }
                    }}
                    disabled={filteredResumes.filter(r => r.status === 'screened-in').length === 0}
                    style={{
                      fontSize: '0.875rem',
                      padding: '0.6rem 1rem',
                      background: 'linear-gradient(135deg, #059669, #047857)'
                    }}
                  >
                    → Move All Screened-In ({filteredResumes.filter(r => r.status === 'screened-in').length})
                  </button>
                  <button
                    style={{ 
                      background: '#6B7280',
                      fontSize: '0.875rem',
                      padding: '0.6rem 1rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                    onClick={async () => {
                      if (!selectedJobId) return;
                      try { await exportStageToExcel(selectedJobId, 'screening'); }
                      catch (err: any) { alert('Export failed'); }
                    }}
                  >
                    📊 Export Excel
                  </button>
                </div>
              </div>

              {/* Live Progress Bar during AI Screening */}
              {aiLoading && aiProgress && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(124, 58, 237, 0.05))',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  borderLeft: '4px solid #7C3AED',
                  borderRadius: 'var(--radius)',
                  padding: '1.25rem',
                  marginBottom: '1.25rem',
                  animation: 'slideUp 0.4s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <p style={{ 
                      margin: 0, 
                      color: '#7C3AED', 
                      fontWeight: '700',
                      fontSize: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      🤖 AI Screening in Progress...
                    </p>
                    <span style={{
                      background: 'rgba(139, 92, 246, 0.2)',
                      color: '#7C3AED',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      fontWeight: '700'
                    }}>
                      {aiProgress.percent}%
                    </span>
                  </div>
                  <div style={{
                    height: '12px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${aiProgress.percent}%`,
                      background: 'linear-gradient(90deg, #8B5CF6, #7C3AED, #6D28D9)',
                      transition: 'width 0.3s ease',
                      boxShadow: '0 0 10px rgba(139, 92, 246, 0.5)'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#6B7280' }}>
                      Processing resume <strong style={{ color: '#7C3AED' }}>{aiProgress.processed}</strong> of <strong>{aiProgress.total}</strong>
                    </p>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#6B7280' }}>
                      ⏱️ Please wait...
                    </p>
                  </div>
                </div>
              )}

              {/* Success Result */}
              {aiResult && !aiLoading && (
                <div style={{
                  background: 'rgba(5, 150, 105, 0.1)',
                  border: '1px solid rgba(5, 150, 105, 0.3)',
                  borderLeft: '4px solid #059669',
                  borderRadius: 'var(--radius)',
                  padding: '1rem 1.25rem',
                  marginBottom: '1.25rem',
                  animation: 'slideUp 0.4s ease'
                }}>
                  <p style={{ 
                    margin: 0, 
                    color: '#059669', 
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    ✅ {aiResult}
                  </p>
                </div>
              )}

              {loadingResumes ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '300px',
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
                  <p className="muted">Loading candidates...</p>
                </div>
              ) : filteredResumes.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '4rem 2rem',
                  background: 'rgba(10, 102, 194, 0.03)',
                  borderRadius: 'var(--radius)',
                  border: '1px dashed rgba(10, 102, 194, 0.2)'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📭</div>
                  <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No candidates found</p>
                  <p className="muted">No candidates match your search criteria for this job.</p>
                </div>
              ) : (
                <div className="table screening-table" style={{
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
                }}>
                  <div className="table-header" style={{
                    background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.12) 0%, rgba(10, 102, 194, 0.08) 100%)',
                    borderBottom: '2px solid rgba(10, 102, 194, 0.2)'
                  }}>
                    <span>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) => toggleAll(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                    </span>
                    <span>ID</span>
                    <span>NAME</span>
                    <span>EMAIL</span>
                    <span>QUALIFICATION</span>
                    <span>SCORE</span>
                    <span>CGPA</span>
                    <span>SPECIALIZATION</span>
                    <span>SUBMITTED</span>
                    <span>STATUS</span>
                    <span>ACTIONS</span>
                  </div>
                  {filteredResumes.map((r, idx) => (
                    <div 
                      key={r._id} 
                      className="table-row"
                      style={{
                        animation: `slideUp 0.3s ease ${idx * 0.05}s backwards`,
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(10, 102, 194, 0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r._id)}
                          onChange={(e) => toggleOne(r._id, e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                      </span>
                      <span style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        color: 'var(--primary)'
                      }}>
                        {r.candidateUniqueId || (r as any).candidateId || '-'}
                      </span>
                      <span style={{ fontWeight: '600' }}>{r.candidateName || '-'}</span>
                      <span>{r.candidateEmail || '-'}</span>
                      <span>{r.highestQualification || '-'}</span>
                      <span style={{ 
                        fontWeight: '600', 
                        color: r.score != null && r.score >= targetScore ? '#059669' : r.score != null && r.score > 0 ? '#DC2626' : 'var(--primary)'
                      }}>
                        {r.score != null && r.score > 0 ? r.score.toFixed(2) : (r.status === 'uploaded' ? 'Pending' : '0.00')}
                      </span>
                      <span>{r.cgpa || '-'}</span>
                      <span>{r.specialization || '-'}</span>
                      <span style={{ fontSize: '0.8rem' }}>
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}
                      </span>
                      <span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          textTransform: 'capitalize',
                          background: r.status === 'screened-in' 
                            ? 'rgba(5, 150, 105, 0.15)' 
                            : r.status === 'screened-out' 
                            ? 'rgba(220, 38, 38, 0.15)' 
                            : 'rgba(107, 114, 128, 0.15)',
                          color: r.status === 'screened-in' 
                            ? '#059669' 
                            : r.status === 'screened-out' 
                            ? '#DC2626' 
                            : '#4B5563',
                          border: `1px solid ${
                            r.status === 'screened-in' 
                              ? 'rgba(5, 150, 105, 0.3)' 
                              : r.status === 'screened-out' 
                              ? 'rgba(220, 38, 38, 0.3)' 
                              : 'rgba(107, 114, 128, 0.3)'
                          }`
                        }}>
                          <span style={{ 
                            width: '6px', 
                            height: '6px', 
                            borderRadius: '50%',
                            background: r.status === 'screened-in' 
                              ? '#10B981' 
                              : r.status === 'screened-out' 
                              ? '#EF4444' 
                              : '#6B7280'
                          }}></span>
                          {r.status}
                        </span>
                      </span>
                      <span className="row-actions" style={{ gap: '0.35rem' }}>
                        <button 
                          className="btn-success" 
                          onClick={() => handleSingleScreen(r._id, 'in')}
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                        >
                          ✓ In
                        </button>
                        <button 
                          className="btn-danger" 
                          onClick={() => handleSingleScreen(r._id, 'out')}
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                        >
                          ✗ Out
                        </button>
                        <button
                          style={{ 
                            background: '#6B7280', 
                            fontSize: '0.75rem', 
                            padding: '0.35rem 0.65rem' 
                          }}
                          onClick={async () => {
                            if (!confirm('Delete this candidate from this step?')) return;
                            try {
                              await deleteResume(r._id);
                              setResumes(prev => prev.filter(x => x._id !== r._id));
                            } catch (err: any) {
                              alert(err?.response?.data?.message || 'Delete failed');
                            }
                          }}
                        >
                          🗑️
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <PipelineStagePanel
              stepKey={selectedStep}
              resumes={stageResumes}
              loading={loadingStage}
              search={stageSearch}
              setSearch={setStageSearch}
              selectedIds={stageSelectedIds}
              setSelectedIds={setStageSelectedIds}
              advanceLoading={advanceLoading}
              message={stageMessage}
              onAdvance={async () => {
                const step = steps.find(s => s.key === selectedStep);
                if (!step) return;
                if (stageSelectedIds.size === 0) return alert('Select at least one candidate');
                setAdvanceLoading(true);
                setStageMessage(null);
                try {
                  const result = await advanceCandidates(Array.from(stageSelectedIds), step.nextStage);
                  setStageMessage(`${result.message} | Emails: ${result.emailsSent}`);
                  const updated = await listResumesByStage(selectedJobId, selectedStep);
                  setStageResumes(updated);
                  setStageSelectedIds(new Set());
                  setTimeout(() => setStageMessage(null), 6000);
                } catch (err: any) {
                  alert(err?.response?.data?.message || 'Failed to advance candidates');
                } finally {
                  setAdvanceLoading(false);
                }
              }}
              onReject={async () => {
                if (stageSelectedIds.size === 0) return alert('Select at least one candidate');
                setAdvanceLoading(true);
                setStageMessage(null);
                try {
                  const result = await advanceCandidates(Array.from(stageSelectedIds), 'rejected');
                  setStageMessage(`Rejected ${result.advanced} candidate(s)`);
                  const updated = await listResumesByStage(selectedJobId, selectedStep);
                  setStageResumes(updated);
                  setStageSelectedIds(new Set());
                  setTimeout(() => setStageMessage(null), 6000);
                } catch (err: any) {
                  alert(err?.response?.data?.message || 'Failed to reject candidates');
                } finally {
                  setAdvanceLoading(false);
                }
              }}
              onExport={async () => {
                if (!selectedJobId) return;
                try {
                  await exportStageToExcel(selectedJobId, selectedStep);
                } catch (err: any) {
                  alert(err?.response?.data?.message || 'Export failed');
                }
              }}
              nextStageLabel={steps.find(s => s.key === selectedStep)?.nextStage || ''}
              onDelete={async (resumeId: string) => {
                if (!confirm('Delete this candidate from this step?')) return;
                try {
                  await deleteResume(resumeId);
                  setStageResumes(prev => prev.filter(x => x._id !== resumeId));
                  stageSelectedIds.delete(resumeId);
                  setStageSelectedIds(new Set(stageSelectedIds));
                } catch (err: any) {
                  alert(err?.response?.data?.message || 'Delete failed');
                }
              }}
            />
          )}
        </section>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @media (max-width: 960px) {
          .page {
            grid-template-columns: 1fr !important;
          }
          .process-sidebar {
            order: 2;
            width: 100% !important;
          }
          .process-main {
            order: 1;
          }
        }
      `}</style>
    </div>
  );
}

// PipelineStagePanel component remains the same...
type PipelineStagePanelProps = {
  stepKey: string;
  resumes: Resume[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: (v: Set<string>) => void;
  advanceLoading: boolean;
  message: string | null;
  onAdvance: () => void;
  onReject: () => void;
  onExport: () => void;
  onDelete: (resumeId: string) => void;
  nextStageLabel: string;
};

function PipelineStagePanel({
  stepKey,
  resumes,
  loading,
  search,
  setSearch,
  selectedIds,
  setSelectedIds,
  advanceLoading,
  message,
  onAdvance,
  onReject,
  onExport,
  onDelete,
  nextStageLabel
}: PipelineStagePanelProps) {
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return resumes.filter(r => {
      if (!term) return true;
      return (
        r.candidateName?.toLowerCase().includes(term) ||
        r.candidateEmail?.toLowerCase().includes(term) ||
        r.candidateUniqueId?.toLowerCase().includes(term) ||
        r.fileName?.toLowerCase().includes(term)
      );
    });
  }, [resumes, search]);

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r._id));

  const toggleAll = (checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) { filtered.forEach(r => next.add(r._id)); }
    else { filtered.forEach(r => next.delete(r._id)); }
    setSelectedIds(next);
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    setSelectedIds(next);
  };

  const advanceLabel: Record<string, string> = {
    assessment: 'Advance to Interview',
    interview: 'Advance to Offer',
    offer: 'Mark as Hired'
  };

  return (
    <div className="screening-panel">
      <div className="screening-toolbar" style={{
        background: 'rgba(255, 255, 255, 0.6)',
        padding: '1.25rem',
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(10, 102, 194, 0.1)',
        marginBottom: '1.25rem',
        gap: '0.75rem'
      }}>
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
            placeholder="Search candidate, email, or ID"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>
        <div className="toolbar-actions" style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          flexWrap: 'wrap' 
        }}>
          <button
            className="btn-success"
            disabled={advanceLoading || selectedIds.size === 0}
            onClick={onAdvance}
            style={{
              fontSize: '0.875rem',
              padding: '0.6rem 1rem'
            }}
          >
            {advanceLoading ? '⏳ Processing...' : selectedIds.size > 0
              ? `→ ${advanceLabel[stepKey] || 'Advance'} (${selectedIds.size})`
              : advanceLabel[stepKey] || 'Advance'}
          </button>
          <button
            className="btn-danger"
            disabled={advanceLoading || selectedIds.size === 0}
            onClick={onReject}
            style={{
              fontSize: '0.875rem',
              padding: '0.6rem 1rem'
            }}
          >
            {selectedIds.size > 0 ? `✗ Reject (${selectedIds.size})` : '✗ Reject'}
          </button>
          <button 
            style={{ 
              background: '#6B7280',
              fontSize: '0.875rem',
              padding: '0.6rem 1rem'
            }} 
            onClick={onExport}
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          background: 'rgba(5, 150, 105, 0.1)',
          border: '1px solid rgba(5, 150, 105, 0.3)',
          borderLeft: '4px solid #059669',
          borderRadius: 'var(--radius)',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          animation: 'slideUp 0.4s ease'
        }}>
          <p style={{ 
            margin: 0, 
            color: '#059669', 
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            ✅ {message}
          </p>
        </div>
      )}

      {loading ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
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
          <p className="muted">Loading candidates...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'rgba(10, 102, 194, 0.03)',
          borderRadius: 'var(--radius)',
          border: '1px dashed rgba(10, 102, 194, 0.2)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📭</div>
          <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No candidates at this stage</p>
          <p className="muted">No candidates found for the selected job at this pipeline stage.</p>
        </div>
      ) : (
        <div className="table screening-table" style={{
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
        }}>
          <div className="table-header" style={{
            background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.12) 0%, rgba(10, 102, 194, 0.08) 100%)',
            borderBottom: '2px solid rgba(10, 102, 194, 0.2)'
          }}>
            <span>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={e => toggleAll(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
            </span>
            <span>ID</span>
            <span>NAME</span>
            <span>EMAIL</span>
            <span>QUALIFICATION</span>
            <span>SCORE</span>
            <span>CGPA</span>
            <span>SPECIALIZATION</span>
            <span>SUBMITTED</span>
            <span>STAGE</span>
            <span>ACTIONS</span>
          </div>
          {filtered.map((r, idx) => (
            <div 
              key={r._id} 
              className="table-row"
              style={{
                animation: `slideUp 0.3s ease ${idx * 0.05}s backwards`,
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(10, 102, 194, 0.03)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span>
                <input
                  type="checkbox"
                  checked={selectedIds.has(r._id)}
                  onChange={e => toggleOne(r._id, e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
              </span>
              <span style={{ 
                fontFamily: 'monospace', 
                fontSize: '0.8rem',
                fontWeight: '600',
                color: 'var(--primary)'
              }}>
                {r.candidateUniqueId || '-'}
              </span>
              <span style={{ fontWeight: '600' }}>{r.candidateName || '-'}</span>
              <span>{r.candidateEmail || '-'}</span>
              <span>{r.highestQualification || '-'}</span>
              <span style={{ 
                fontWeight: '600', 
                color: r.score != null && r.score > 0 ? '#059669' : 'var(--primary)'
              }}>
                {r.score != null && r.score > 0 ? r.score.toFixed(2) : '-'}
              </span>
              <span>{r.cgpa || '-'}</span>
              <span>{r.specialization || '-'}</span>
              <span style={{ fontSize: '0.8rem' }}>
                {r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}
              </span>
              <span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  background: 'rgba(10, 102, 194, 0.15)',
                  color: '#0A66C2',
                  border: '1px solid rgba(10, 102, 194, 0.3)'
                }}>
                  <span style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%',
                    background: '#0A66C2'
                  }}></span>
                  {r.pipelineStage || stepKey}
                </span>
              </span>
              <span className="row-actions" style={{ gap: '0.35rem' }}>
                <button
                  className="btn-success"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => {
                    setSelectedIds(new Set([r._id]));
                    setTimeout(onAdvance, 0);
                  }}
                >
                  {stepKey === 'offer' ? '✓ Hire' : '→ Advance'}
                </button>
                <button
                  className="btn-danger"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => {
                    setSelectedIds(new Set([r._id]));
                    setTimeout(onReject, 0);
                  }}
                >
                  ✗ Reject
                </button>
                <button
                  style={{ background: '#6B7280', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => onDelete(r._id)}
                >
                  🗑️
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}