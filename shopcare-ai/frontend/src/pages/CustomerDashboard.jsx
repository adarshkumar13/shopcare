import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create Ticket Form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Refund Request');
  const [priority, setPriority] = useState('medium');
  const [orderId, setOrderId] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [ordRes, tktRes, refRes] = await Promise.all([
        api.get('/orders'),
        api.get('/tickets'),
        api.get('/refunds'),
      ]);
      setOrders(ordRes.data.orders || []);
      setTickets(tktRes.data.tickets || []);
      setRefunds(refRes.data.refunds || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    setFormError('');
    if (subject.trim().length < 3 || description.trim().length < 3) {
      setFormError('Please provide both a subject and a detailed description (min 3 chars).');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/tickets', {
        subject: subject.trim(),
        category,
        priority,
        order_id: orderId || null,
        description: description.trim(),
      });
      navigate(`/tickets/${res.data.ticket.id}`);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Could not create support ticket.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">Loading your orders and support tickets...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Customer Support &amp; Refund Portal</h1>
        <p className="muted" style={{ marginTop: '0.25rem' }}>
          Review orders, create AI-assisted support tickets, and track refunds (auto-approved up to ₹5,000).
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">My Orders</div>
          <div className="stat-value">{orders.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Support Tickets</div>
          <div className="stat-value">{tickets.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved Refunds</div>
          <div className="stat-value">
            {refunds.filter((r) => r.status === 'approved').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Auto-Refund Cap</div>
          <div className="stat-value">₹5,000</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Create Support Ticket</h2>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={handleCreateTicket}>
            <div className="form-group">
              <label className="form-label" htmlFor="ticket-order">
                Related Order (Optional)
              </label>
              <select
                id="ticket-order"
                className="select"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              >
                <option value="">-- No specific order selected --</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.order_number} — {o.item_details?.name} (₹{Number(o.total_amount).toLocaleString('en-IN')}, {o.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="ticket-category">
                  Category
                </label>
                <select
                  id="ticket-category"
                  className="select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Refund Request">Refund Request</option>
                  <option value="Damaged Item">Damaged Item</option>
                  <option value="Return Eligibility">Return Eligibility</option>
                  <option value="General Inquiry">General Inquiry</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ticket-priority">
                  Priority
                </label>
                <select
                  id="ticket-priority"
                  className="select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="ticket-subject">
                Subject
              </label>
              <input
                id="ticket-subject"
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Requesting refund for defective earbuds"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="ticket-desc">
                Message to Support / AI Assistant
              </label>
              <textarea
                id="ticket-desc"
                className="textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your issue and include your order number if applicable..."
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Starting AI Chat...' : 'Create Ticket & Start Chat'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>My Support Tickets</h2>
          {tickets.length === 0 ? (
            <div className="empty-state">You have no support tickets yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Outcome</th>
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
                      <td>{t.order_number || '—'}</td>
                      <td>
                        <StatusBadge value={t.status} />
                      </td>
                      <td>
                        {t.refund_status ? (
                          <StatusBadge value={t.refund_status} />
                        ) : t.escalation_decision ? (
                          <StatusBadge value={t.escalation_decision} />
                        ) : (
                          <span className="muted">Active</span>
                        )}
                      </td>
                      <td>
                        <Link to={`/tickets/${t.id}`} className="btn btn-secondary btn-sm">
                          Open Chat
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

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Recent Orders</h2>
        {orders.length === 0 ? (
          <div className="empty-state">No orders found on your account.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Item &amp; Category</th>
                  <th>Status</th>
                  <th>Delivery Date</th>
                  <th>Return Window</th>
                  <th>Total</th>
                  <th>Refund Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.order_number}</strong>
                    </td>
                    <td>
                      <div>{o.item_details?.name}</div>
                      <div className="muted">{o.item_details?.category}</div>
                    </td>
                    <td>
                      <StatusBadge value={o.status} />
                    </td>
                    <td>
                      {o.delivery_date
                        ? new Date(o.delivery_date).toLocaleDateString()
                        : 'Not delivered'}
                    </td>
                    <td>{o.item_details?.return_window_days ?? 15} days</td>
                    <td>₹{Number(o.total_amount).toLocaleString('en-IN')}</td>
                    <td>
                      {o.refunds && o.refunds.length > 0 ? (
                        <StatusBadge value={o.refunds[0].status} />
                      ) : (
                        <span className="muted">None</span>
                      )}
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
