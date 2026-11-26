import React from 'react';

export default function StatusBadge({ value }) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  const label = normalized.replace(/_/g, ' ');
  return <span className={`badge badge-${normalized}`}>{label}</span>;
}
