import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchJob, createJob, updateJob, Job } from '../services/jobs';

const emptyJob: Partial<Job> = {
  title: '',
  description: '',
  requiredSkills: [],
  niceToHaveSkills: [],
  experienceYears: undefined,
  salaryRange: { min: undefined, max: undefined, currency: 'USD' },
  location: '',
  status: 'active'
};

export default function JobEditor() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<Partial<Job>>(emptyJob);
  const [requiredSkillsInput, setRequiredSkillsInput] = useState('');
  const [niceSkillsInput, setNiceSkillsInput] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const data = await fetchJob(id!);
        setForm({
          ...data,
          requiredSkills: data.requiredSkills || [],
          niceToHaveSkills: data.niceToHaveSkills || [],
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

  const parseSkills = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

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
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save job'}</button>
      </form>
    </div>
  );
}
