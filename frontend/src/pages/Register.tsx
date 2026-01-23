import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('candidate');
  const [employeeId, setEmployeeId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [highestQualificationDegree, setHighestQualificationDegree] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [cgpaOrPercentage, setCgpaOrPercentage] = useState('');
  const [passoutYear, setPassoutYear] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const roles = [
    { value: 'recruiterAdmin', label: 'Recruiter Admin' },
    { value: 'hrManager', label: 'HR Manager' },
    { value: 'candidate', label: 'Candidate' }
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const candidateFields = role === 'candidate'
        ? {
            highestQualificationDegree: highestQualificationDegree || undefined,
            specialization: specialization || undefined,
            cgpaOrPercentage: cgpaOrPercentage || undefined,
            passoutYear: passoutYear ? Number(passoutYear) : undefined
          }
        : {};

      const hrFields = role !== 'candidate'
        ? {
            employeeId: employeeId || undefined,
            companyName: companyName || undefined
          }
        : {};

      await register({
        email,
        password,
        name,
        role,
        ...candidateFields,
        ...hrFields
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <h1>Create account</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="role-toggle" aria-label="Select role">
          {roles.map((r) => (
            <button
              key={r.value}
              type="button"
              className={role === r.value ? 'role-btn active' : 'role-btn'}
              onClick={() => setRole(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} />
        </label>
        
        {(role === 'hrManager' || role === 'recruiterAdmin') && (
          <>
            <label>
              Employee ID
              <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. EMP-001" />
            </label>
            <label>
              Company Name
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. ABC Corp" />
            </label>
          </>
        )}

        {role === 'candidate' && (
          <>
            <label>
              Highest qualification degree
              <select value={highestQualificationDegree} onChange={(e) => setHighestQualificationDegree(e.target.value)} required>
                <option value="">Select qualification</option>
                <option value="High School">High School</option>
                <option value="Diploma">Diploma</option>
                <option value="Bachelor's">Bachelor's</option>
                <option value="Master's">Master's</option>
                <option value="PhD">PhD</option>
              </select>
            </label>
            <label>
              Specialization
              <input value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="e.g. Computer Science" />
            </label>
            <label>
              Percentage / CGPA
              <input value={cgpaOrPercentage} onChange={(e) => setCgpaOrPercentage(e.target.value)} placeholder="e.g. 8.1 CGPA or 78%" />
            </label>
            <label>
              Pass-out year
              <input value={passoutYear} onChange={(e) => setPassoutYear(e.target.value)} type="number" min="1950" max="2100" placeholder="e.g. 2024" />
            </label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
      </form>
      <p className="muted">Already have an account? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
