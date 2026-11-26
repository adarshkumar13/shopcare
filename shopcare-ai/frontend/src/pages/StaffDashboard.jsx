import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function StaffDashboard() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [search, setSearch] = useState('');

  const fetchQueue = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (escalatedOnly) params.escalated = 'true';
      if (search.trim()) params.search = search.trim();

      const res = await api.get('/admin/tickets', { params });
      setTickets(res.data.tickets || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load staff queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [statusFilter, priorityFilter, escalatedOnly]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchQueue();
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Support Staff Operations Queue</h1>
        <p className="muted" style={{ marginTop: '0.25rem' }}>
          Inspect AI-handled tickets, review high-value escalations (&gt; ₹5,000), and audit refund actions.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Visible Tickets</div>
          <div className="stat-value">{tickets.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Escalated Queue</div>
          <div className="stat-value">
            {tickets.filter((t) => t.status === 'escalated').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Decisions</div>
          <div className="stat-value">
            {tickets.filter((t) => t.escalation_decision === 'pending').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Resolved / Closed</div>
          <div className="stat-value">
            {tickets.filter((t) => ['resolved', 'closed'].includes(t.status)).length}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            type="text"
            className="input"
            style={{ flex: 2, minWidth: '210px' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticket #, customer name/email, subject, or order #..."
          />
          <select
            className="select"
            style={{ flex: 1, minWidth: '140px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="escalated">Escalated</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            className="select"
            style={{ flex: 1, minWidth: '140px' }}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}>
            <input
              type="checkbox"
              checked={escalatedOnly}
              onChange={(e) => setEscalatedOnly(e.target.checked)}
            />
            Escalated cases only
          </label>
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <div>Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="empty-state">No tickets match the selected filters.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Customer</th>
                  <th>Order &amp; Amount</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Escalation / Refund</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.ticket_number}</strong>
                      <div className="muted">{t.subject}</div>
                    </td>
                    <td>
                      <div>{t.customer_name}</div>
                      <div className="muted">{t.customer_email}</div>
                    </td>
                    <td>
                      {t.order_number ? (
                        <>
                          <div>{t.order_number}</div>
                          <div className="muted">
                            ₹{Number(t.order_total || 0).toLocaleString('en-IN')}
                          </div>
                        </>
                      ) : (
                        <span className="muted">Unlinked</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge value={t.priority} />
                    </td>
                    <td>
                      <StatusBadge value={t.status} />
                    </td>
                    <td>
                      {t.escalation_decision && (
                        <div>
                          Esc: <StatusBadge value={t.escalation_decision} />
                        </div>
                      )}
                      {t.refund_status && (
                        <div style={{ marginTop: '0.2rem' }}>
                          Ref: <StatusBadge value={t.refund_status} />
                        </div>
                      )}
                    </td>
                    <td>
                      <Link to={`/staff/tickets/${t.id}`} className="btn btn-primary btn-sm">
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
