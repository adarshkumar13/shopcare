import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import ChatThread from '../components/ChatThread';
import StatusBadge from '../components/StatusBadge';

export default function StaffTicketReviewPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [staffReply, setStaffReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [ticketStatus, setTicketStatus] = useState('open');
  const [busy, setBusy] = useState(false);

  const loadInspection = async () => {
    try {
      const res = await api.get(`/admin/tickets/${id}`);
      setData(res.data);
      setTicketStatus(res.data.ticket.status);
      if (res.data.ticket.order_total && !refundAmount) {
        setRefundAmount(String(res.data.ticket.order_total));
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load inspection data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInspection();
  }, [id]);

  const handleStaffReply = async (e) => {
    e.preventDefault();
    if (!staffReply.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/tickets/${id}/messages`, { content: staffReply.trim() });
      setStaffReply('');
      setNotice('Staff message sent to customer.');
      await loadInspection();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send message.');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusUpdate = async () => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/admin/tickets/${id}/status`, {
        status: ticketStatus,
        note: internalNote || undefined,
      });
      setNotice(`Ticket status updated to ${ticketStatus}.`);
      await loadInspection();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update status.');
    } finally {
      setBusy(false);
    }
  };

  const handleEscalationDecision = async (escalationId, decision) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/admin/escalations/${escalationId}/decision`, {
        decision,
        internal_note: internalNote,
        refund_amount: refundAmount ? Number(refundAmount) : undefined,
      });
      setNotice(`Escalation marked as ${decision.replace(/_/g, ' ')}.`);
      setInternalNote('');
      await loadInspection();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply escalation decision.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">Loading ticket inspection view...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container">
        <div className="alert alert-error">{error}</div>
        <Link to="/staff" className="btn btn-secondary">
          Back to Staff Queue
        </Link>
      </div>
    );
  }

  const { ticket, messages, refunds, escalations, audit_logs } = data;
  const activeEscalation = escalations[0] || null;

  return (
    <div className="container">
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <Link to="/staff" className="muted">
            &larr; Back to Staff Queue
          </Link>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.35rem' }}>
            {ticket.ticket_number}: {ticket.subject}
          </h1>
          <div className="muted">
            Customer: {ticket.customer_name} ({ticket.customer_email})
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusBadge value={ticket.status} />
          <StatusBadge value={ticket.priority} />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="grid-sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Conversation History</h2>
            <ChatThread messages={messages} />

            <form onSubmit={handleStaffReply} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input"
                style={{ flex: 1, minWidth: '220px' }}
                value={staffReply}
                onChange={(e) => setStaffReply(e.target.value)}
                placeholder="Write a staff reply to the customer..."
                disabled={busy}
              />
              <button type="submit" className="btn btn-primary" disabled={busy || !staffReply.trim()}>
                Send Staff Reply
              </button>
            </form>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Audit Trail</h2>
            {audit_logs.length === 0 ? (
              <div className="muted">No audit events recorded for this ticket yet.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit_logs.map((log) => (
                      <tr key={log.id}>
                        <td className="muted">{new Date(log.created_at).toLocaleString()}</td>
                        <td>
                          <code>{log.action}</code>
                        </td>
                        <td>{log.actor_name || 'System'}</td>
                        <td className="muted">{JSON.stringify(log.details)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Linked Order Context</h3>
            {ticket.order_number ? (
              <div style={{ fontSize: '0.9rem' }}>
                <div>
                  <strong>Order #:</strong> {ticket.order_number}
                </div>
                <div>
                  <strong>Item:</strong> {ticket.order_item_details?.name}
                </div>
                <div>
                  <strong>Category:</strong> {ticket.order_item_details?.category}
                </div>
                <div>
                  <strong>Order Total:</strong> ₹{Number(ticket.order_total).toLocaleString('en-IN')}
                </div>
                <div>
                  <strong>Status:</strong> <StatusBadge value={ticket.order_status} />
                </div>
                <div>
                  <strong>Delivery Date:</strong>{' '}
                  {ticket.order_delivery_date
                    ? new Date(ticket.order_delivery_date).toLocaleDateString()
                    : 'Not delivered'}
                </div>
                <div>
                  <strong>Return Window:</strong>{' '}
                  {ticket.order_item_details?.return_window_days ?? 15} days
                </div>
              </div>
            ) : (
              <div className="muted">No order attached to this ticket.</div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Escalation &amp; Refund Review</h3>
            {activeEscalation ? (
              <>
                <div style={{ marginBottom: '0.6rem', fontSize: '0.9rem' }}>
                  <div>
                    <strong>Current Decision:</strong>{' '}
                    <StatusBadge value={activeEscalation.decision} />
                  </div>
                  <p className="muted" style={{ margin: '0.4rem 0' }}>
                    {activeEscalation.summary}
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="refund-amt">
                    Refund Amount (₹) if Approving
                  </label>
                  <input
                    id="refund-amt"
                    type="number"
                    className="input"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    min="1"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="internal-note">
                    Internal Staff Note
                  </label>
                  <textarea
                    id="internal-note"
                    className="textarea"
                    rows={3}
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Add review justification or instructions..."
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    disabled={busy}
                    onClick={() => handleEscalationDecision(activeEscalation.id, 'approved')}
                  >
                    Approve &amp; Refund
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busy}
                    onClick={() => handleEscalationDecision(activeEscalation.id, 'rejected')}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-warning btn-sm"
                    disabled={busy}
                    onClick={() =>
                      handleEscalationDecision(activeEscalation.id, 'more_info_requested')
                    }
                  >
                    Request More Info
                  </button>
                </div>
              </>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>
                No escalation record on this ticket.
              </p>
            )}

            {refunds.length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                <strong style={{ fontSize: '0.88rem' }}>Refund Records</strong>
                {refunds.map((r) => (
                  <div key={r.id} style={{ marginTop: '0.4rem', fontSize: '0.86rem' }}>
                    ₹{Number(r.amount).toLocaleString('en-IN')} — <StatusBadge value={r.status} />
                    <div className="muted">{r.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Ticket Status Control</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                className="select"
                value={ticketStatus}
                onChange={(e) => setTicketStatus(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={handleStatusUpdate}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
