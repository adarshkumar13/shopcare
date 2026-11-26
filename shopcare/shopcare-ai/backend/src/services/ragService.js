const fs = require('fs');
const path = require('path');

const KB_DIR = path.resolve(__dirname, '../../knowledge_base');

function loadPolicySections() {
  if (!fs.existsSync(KB_DIR)) return [];
  const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith('.md')).sort();
  const sections = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(KB_DIR, file), 'utf8');
    const chunks = content.split(/\n(?=##\s+)/);
    for (const chunk of chunks) {
      const text = chunk.trim();
      if (!text) continue;
      const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
      sections.push({
        source: file,
        heading: firstLine,
        content: text,
      });
    }
  }
  return sections;
}

function searchReturnPolicy(categoryOrQuery = '') {
  const queryStr = String(categoryOrQuery || 'refund return').toLowerCase();
  const tokens = queryStr
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const sections = loadPolicySections();

  const scored = sections.map((sec) => {
    const haystack = `${sec.source} ${sec.heading} ${sec.content}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (haystack.includes(tok)) score += 2;
      if (sec.heading.toLowerCase().includes(tok)) score += 2;
    }
    if (sec.source === 'general_refund_and_escalation_policy.md') {
      score += 1;
    }
    return { ...sec, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 4);
  const citations = [...new Set(top.map((s) => s.source))];

  return {
    query: categoryOrQuery,
    citations,
    excerpts: top.map((s) => ({
      source: s.source,
      heading: s.heading,
      content: s.content,
    })),
    summary: top.map((s) => `[${s.source} - ${s.heading}]\n${s.content}`).join('\n\n'),
  };
}

module.exports = {
  searchReturnPolicy,
  loadPolicySections,
};
