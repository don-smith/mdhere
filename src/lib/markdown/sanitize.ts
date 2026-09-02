import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: [
      'data-mdhere-path',
      'data-mdhere-fragment',
      'data-mdhere-external',
      'data-mdhere-image-unavailable',
      'tabindex'
    ],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mdhere-asset):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
  });
}
