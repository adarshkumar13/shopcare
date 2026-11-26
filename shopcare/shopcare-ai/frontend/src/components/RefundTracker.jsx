import React from 'react';
import StatusBadge from './StatusBadge';

export default function RefundTracker({ ticket, refunds = [], escalations = [] }) {
  const latestRefund = refunds[0] || null;
  const latestEscalation = escalations[0] || null;

  const isRejected =
    latestRefund?.status === 'rejected' || latestEscalation?.decision === 'rejected';
  const isApproved = latestRefund?.status === 'approved';
  const isEscalated = ticket?.status === 'escalated' || Boolean(latestEscalation);

  const steps = [
    { label: '1. Ticket Created', state: 'done' },
    {
      label: '2. Policy & Order Check',
      state: ticket?.order_id || isApproved || isEscalated ? 'done' : 'active',
    },
    {
      label: isEscalated ? '3. Staff Review' : '3. Eligibility Check',
      state: isApproved || isRejected ? 'done' : isEscalated ? 'active' : 'pending',
    },
    {
      label: isRejected ? '4. Declined' : '4. Refund Approved',
      state: isApproved ? 'done' : isRejected ? 'rejected' : 'pending',
    },
  ];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Refund Progress Tracker</h3>
        {latestRefund && <StatusBadge value={latestRefund.status} />}
      </div>

      <div className="tracker-steps">
        {steps.map((s) => (
          <div key={s.label} className={`tracker-step ${s.state}`}>
            {s.label}
          </div>
        ))}
      </div>

      {latestRefund ? (
        <div style={{ marginTop: '0.85rem', fontSize: '0.88rem' }}>
          <div>
            <strong>Refund Amount:</strong> ₹{Number(latestRefund.amount).toLocaleString('en-IN')}
          </div>
          <div className="muted">Reason: {latestRefund.reason}</div>
          <div className="muted">Ref ID: {latestRefund.id}</div>
        </div>
      ) : latestEscalation ? (
        <div style={{ marginTop: '0.85rem', fontSize: '0.88rem' }}>
          <div>
            <strong>Escalation Decision:</strong>{' '}
            <StatusBadge value={latestEscalation.decision} />
          </div>
          <div className="muted" style={{ marginTop: '0.25rem' }}>
            {latestEscalation.summary}
          </div>
        </div>
      ) : (
        <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
          No refund transaction issued yet. Chat with the AI assistant to check eligibility.
        </p>
      )}
    </div>
  );
}
