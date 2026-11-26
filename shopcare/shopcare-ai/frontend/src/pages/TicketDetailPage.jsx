import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import ChatThread from '../components/ChatThread';
import RefundTracker from '../components/RefundTracker';
import StatusBadge from '../components/StatusBadge';

export default function TicketDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadTicket = async () => {
    try {
      const res = await api.get(`/tickets/${id}`);
      setData(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load ticket details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
  }, [id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/tickets/${id}/messages`, { content: message.trim() });
      setMessage('');
      await loadTicket();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">Loading conversation...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container">
        <div className="alert alert-error">{error}</div>
        <Link to="/dashboard" className="btn btn-secondary">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { ticket, messages, refunds, escalations } = data;

  return (
    <div className="container">
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <Link to="/dashboard" className="muted">
            &larr; Back to Customer Portal
          </Link>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.35rem' }}>
            {ticket.ticket_number}: {ticket.subject}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusBadge value={ticket.status} />
          <StatusBadge value={ticket.priority} />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-sidebar">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Multi-Turn Support Conversation</h2>
          <ChatThread messages={messages} />

          <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: '220px' }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Reply to AI Support Agent (e.g., ORD-1001, please refund ₹1499)..."
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !message.trim()}>
              {sending ? 'Processing...' : 'Send'}
            </button>
          </form>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <RefundTracker ticket={ticket} refunds={refunds} escalations={escalations} />

          <div className="card">
            <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Linked Order Details</h3>
            {ticket.order_number ? (
              <div style={{ fontSize: '0.9rem' }}>
                <div>
                  <strong>Order:</strong> {ticket.order_number}
                </div>
                <div>
                  <strong>Item:</strong> {ticket.order_item_details?.name}
                </div>
                <div>
                  <strong>Category:</strong> {ticket.order_item_details?.category}
                </div>
                <div>
                  <strong>Amount:</strong> ₹{Number(ticket.order_total).toLocaleString('en-IN')}
                </div>
                <div>
                  <strong>Status:</strong> <StatusBadge value={ticket.order_status} />
                </div>
                <div>
                  <strong>Delivered:</strong>{' '}
                  {ticket.order_delivery_date
                    ? new Date(ticket.order_delivery_date).toLocaleDateString()
                    : 'Not yet delivered'}
                </div>
                <div>
                  <strong>Return Window:</strong>{' '}
                  {ticket.order_item_details?.return_window_days ?? 15} days
                </div>
              </div>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>
                No order linked yet. Mention your Order Number (e.g., <code>ORD-1001</code>) in chat.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
