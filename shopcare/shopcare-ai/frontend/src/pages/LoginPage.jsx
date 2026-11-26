import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'staff' ? '/staff' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to login. Please verify credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const quickFill = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h2 style={{ marginTop: 0 }}>Sign in to ShopCare AI</h2>
        <p className="muted">Customer support, AI refund resolution, and escalation portal.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@demo.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="demo-box">
          <strong>Demo Accounts (Click to autofill):</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => quickFill('alice@demo.com', 'Customer123!')}
            >
              Alice (Customer)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => quickFill('bob@demo.com', 'Customer123!')}
            >
              Bob (Customer 2)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => quickFill('staff@demo.com', 'Staff123!')}
            >
              Support Staff
            </button>
          </div>
        </div>

        <p className="muted" style={{ marginBottom: 0, marginTop: '1rem', textAlign: 'center' }}>
          New customer? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
