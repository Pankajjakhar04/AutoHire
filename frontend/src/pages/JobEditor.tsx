import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchJob, createJob, updateJob, Job } from '../services/jobs';
import { useAuth } from '../context/AuthContext';

const emptyJob: Partial<Job> = {
  title: '',
  description: '',
  requiredSkills: [],
  niceToHaveSkills: [],
  experienceYears: undefined,
  eligibilityCriteria: {
    educationMinLevel: [],
    specialization: '',
    academicQualification: '',
    minExperienceYears: undefined,
    customCriteria: []
  },
  salaryRange: { min: undefined, max: undefined, currency: 'USD' },
  location: '',
  status: 'active'
};

const educationOptions: { value: 'highSchool' | 'diploma' | 'bachelors' | 'masters' | 'phd'; label: string }[] = [
  { value: 'highSchool', label: 'High School' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'bachelors', label: "Bachelor's" },
  { value: 'masters', label: "Master's" },
  { value: 'phd', label: 'PhD' }
];

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

export default function JobEditor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<Partial<Job>>(emptyJob);
  const [requiredSkillsInput, setRequiredSkillsInput] = useState('');
  const [niceSkillsInput, setNiceSkillsInput] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customEligibilityInput, setCustomEligibilityInput] = useState('');

  const isRecruiter = user?.role === 'recruiterAdmin' || user?.role === 'hrManager';

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const data = await fetchJob(id!);
        setForm({
          ...data,
          requiredSkills: data.requiredSkills || [],
          niceToHaveSkills: data.niceToHaveSkills || [],
          eligibilityCriteria: {
            educationMinLevel: Array.isArray(data.eligibilityCriteria?.educationMinLevel) 
              ? data.eligibilityCriteria.educationMinLevel 
              : data.eligibilityCriteria?.educationMinLevel 
                ? [data.eligibilityCriteria.educationMinLevel] 
                : [],
            specialization: data.eligibilityCriteria?.specialization || '',
            academicQualification: data.eligibilityCriteria?.academicQualification || '',
            minExperienceYears: data.eligibilityCriteria?.minExperienceYears,
            customCriteria: data.eligibilityCriteria?.customCriteria || []
          },
          salaryRange: data.salaryRange || {}
        });
        setRequiredSkillsInput((data.requiredSkills || []).join(', '));
        setNiceSkillsInput((data.niceToHaveSkills || []).join(', '));
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load job');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const updateField = (key: keyof Job, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateEligibility = (patch: Partial<NonNullable<Job['eligibilityCriteria']>>) => {
    setForm((prev) => ({
      ...prev,
      eligibilityCriteria: {
        ...(prev.eligibilityCriteria || {}),
        ...patch
      }
    }));
  };

  const parseSkills = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

  const addCustomEligibility = () => {
    const value = customEligibilityInput.trim();
    if (!value) return;
    const current = form.eligibilityCriteria?.customCriteria || [];
    updateEligibility({ customCriteria: [...current, value] });
    setCustomEligibilityInput('');
  };

  const removeCustomEligibility = (idx: number) => {
    const current = form.eligibilityCriteria?.customCriteria || [];
    updateEligibility({ customCriteria: current.filter((_, i) => i !== idx) });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Partial<Job> = {
        ...form,
        requiredSkills: parseSkills(requiredSkillsInput),
        niceToHaveSkills: parseSkills(niceSkillsInput)
      };
      if (isEdit) {
        await updateJob(id!, payload);
      } else {
        await createJob(payload);
      }
      navigate('/jobs');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!isRecruiter) return <div className="page"><p className="error">Forbidden: recruiter access only.</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <div className="page-head">
        <h1>{isEdit ? 'Edit job' : 'New job'}</h1>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Title
          <input value={form.title || ''} onChange={(e) => updateField('title', e.target.value)} required />
        </label>
        <label>
          Description
          <textarea
            value={form.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            required
            rows={4}
          />
        </label>
        <label>
          Required skills (comma separated)
          <textarea
            rows={2}
            value={requiredSkillsInput}
            onChange={(e) => setRequiredSkillsInput(e.target.value)}
            placeholder="e.g. JavaScript, React, Node.js"
          />
        </label>
        <label>
          Nice to have skills (comma separated)
          <textarea
            rows={2}
            value={niceSkillsInput}
            onChange={(e) => setNiceSkillsInput(e.target.value)}
            placeholder="e.g. GraphQL, Docker"
          />
        </label>
        <label>
          Experience (years)
          <input
            type="number"
            min={0}
            value={form.experienceYears ?? ''}
            onChange={(e) => updateField('experienceYears', e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </label>
        <label>
          Salary Currency
          <select value={form.salaryRange?.currency || 'USD'} onChange={(e) => updateField('salaryRange', { ...form.salaryRange, currency: e.target.value })}>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="INR">INR (₹)</option>
            <option value="AUD">AUD ($)</option>
            <option value="CAD">CAD ($)</option>
            <option value="SGD">SGD ($)</option>
            <option value="JPY">JPY (¥)</option>
          </select>
        </label>
        <label>
          Salary min
          <input
            type="number"
            value={form.salaryRange?.min ?? ''}
            onChange={(e) => updateField('salaryRange', { ...form.salaryRange, min: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </label>
        <label>
          Salary max
          <input
            type="number"
            value={form.salaryRange?.max ?? ''}
            onChange={(e) => updateField('salaryRange', { ...form.salaryRange, max: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </label>
        <label>
          Location
          <input value={form.location || ''} onChange={(e) => updateField('location', e.target.value)} />
        </label>
        <label>
          Status
          <select value={form.status || 'active'} onChange={(e) => updateField('status', e.target.value as any)}>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <div className="card" style={{ marginTop: '0.25rem' }}>
          <h3>Eligibility Criteria</h3>
          <p className="muted">Configure eligibility rules candidates can self-check before applying.</p>

          <label>
            Minimum education level (select multiple - higher degrees satisfy lower requirements)
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'rgba(253, 254, 254, 0.9)' }}>
              {educationOptions.map((opt) => {
                const selectedLevels = form.eligibilityCriteria?.educationMinLevel || [];
                const isSelected = Array.isArray(selectedLevels) && selectedLevels.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(10, 102, 194, 0.1)' : 'transparent',
                      border: isSelected ? '1px solid rgba(10, 102, 194, 0.3)' : '1px solid transparent',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const current = form.eligibilityCriteria?.educationMinLevel || [];
                        const updated = e.target.checked
                          ? [...(Array.isArray(current) ? current : current ? [current] : []), opt.value]
                          : (Array.isArray(current) ? current : current ? [current] : []).filter((v) => v !== opt.value);
                        updateEligibility({ educationMinLevel: updated.length > 0 ? updated : [] });
                      }}
                      style={{ margin: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.875rem', fontWeight: isSelected ? 600 : 500 }}>{opt.label}</span>
                  </label>
                );
              })}
            </div>
            {(form.eligibilityCriteria?.educationMinLevel || []).length === 0 && (
              <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                No education level selected - any education level will be accepted
              </p>
            )}
          </label>

          <label>
            Minimum years of experience
            <input
              type="number"
              min={0}
              value={form.eligibilityCriteria?.minExperienceYears ?? ''}
              onChange={(e) =>
                updateEligibility({ minExperienceYears: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              placeholder="e.g. 2"
            />
          </label>

          <label>
            Specialization / Stream
            <input
              list="eligibility-specialization-options"
              value={form.eligibilityCriteria?.specialization || ''}
              onChange={(e) => updateEligibility({ specialization: e.target.value })}
              placeholder="Any (optional)"
            />
            <datalist id="eligibility-specialization-options">
              {specializationOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <label>
            Academic qualification
            <input
              list="eligibility-qualification-options"
              value={form.eligibilityCriteria?.academicQualification || ''}
              onChange={(e) => updateEligibility({ academicQualification: e.target.value })}
              placeholder="Any (optional)"
            />
            <datalist id="eligibility-qualification-options">
              {qualificationOptions.map((q) => (
                <option key={q} value={q} />
              ))}
            </datalist>
          </label>

          <label>
            Custom eligibility criteria (add multiple)
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                value={customEligibilityInput}
                onChange={(e) => setCustomEligibilityInput(e.target.value)}
                placeholder="e.g. Must have a valid work permit"
              />
              <button type="button" onClick={addCustomEligibility}>Add</button>
            </div>
            {(form.eligibilityCriteria?.customCriteria || []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {(form.eligibilityCriteria?.customCriteria || []).map((c, idx) => (
                  <div key={`${c}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', border: '1px solid var(--border)', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(253, 254, 254, 0.9)' }}>
                    <span style={{ fontSize: '0.875rem' }}>{c}</span>
                    <button type="button" className="btn-danger" onClick={() => removeCustomEligibility(idx)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </label>
        </div>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save job'}</button>
      </form>
    </div>
  );
}
