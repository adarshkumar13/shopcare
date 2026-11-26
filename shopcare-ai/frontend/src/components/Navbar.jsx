import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-dot" />
          <span>ShopCare AI</span>
        </Link>

        <nav className="nav-actions">
          {user ? (
            <>
              <Link
                to={user.role === 'staff' ? '/staff' : '/dashboard'}
                className="btn btn-secondary btn-sm"
              >
                {user.role === 'staff' ? 'Staff Queue' : 'Customer Portal'}
              </Link>
              <span className="muted">
                {user.name} <StatusBadge value={user.role} />
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary btn-sm">
                Login
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
