import sanitizeHtml from 'sanitize-html';

// Only the markup our editor can produce. Everything else (scripts, styles,
// event handlers, iframes) is stripped before it reaches the database.
const OPTIONS = {
  allowedTags: ['h1', 'h2', 'h3', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

export function cleanHtml(html) {
  return sanitizeHtml(String(html ?? ''), OPTIONS);
}
