import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-logo">
        <div className="auth-logo-mark">A</div>
        <div>
          <div className="auth-logo-name">AutoHire Pro</div>
          <div className="auth-logo-sub">AI Based Recruitment Platform</div>
        </div>
      </div>
      <div className="auth-shell">
        <h1>Sign in</h1>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
        <p className="muted">No account? <Link to="/register">Create one</Link></p>
      </div>
    </div>
  );
}
