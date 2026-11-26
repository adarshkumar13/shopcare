import React from 'react';

function senderLabel(type) {
  if (type === 'customer') return 'Customer';
  if (type === 'ai') return 'AI Support Agent';
  if (type === 'staff') return 'Support Staff';
  return 'System';
}

export default function ChatThread({ messages = [] }) {
  if (messages.length === 0) {
    return <div className="empty-state">No messages yet. Start the conversation below.</div>;
  }

  return (
    <div className="chat-box">
      {messages.map((m) => {
        const citations = m.metadata?.citations || [];
        const tools = m.metadata?.tool_calls || [];
        return (
          <div key={m.id} className={`msg msg-${m.sender_type}`}>
            <div className="msg-meta">
              <strong>{senderLabel(m.sender_type)}</strong>
              <span>{new Date(m.created_at).toLocaleString()}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            {citations.length > 0 && (
              <div className="citation-row">
                {citations.map((c) => (
                  <span key={c} className="citation-chip">
                    Policy: {c}
                  </span>
                ))}
              </div>
            )}
            {tools.length > 0 && (
              <div className="citation-row">
                {tools.map((t, idx) => (
                  <span key={`${t.tool}-${idx}`} className="citation-chip">
                    Tool: {t.tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
