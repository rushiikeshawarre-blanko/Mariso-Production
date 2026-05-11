export const normalizeEditorHtml = (html = '') => {
  const trimmed = html.trim();
  if (!trimmed) return '';
  if (trimmed === '<br>' || trimmed === '<div><br></div>' || trimmed === '<p><br></p>') {
    return '';
  }
  return trimmed;
};

export const htmlToPlainText = (html = '') => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return (container.textContent || container.innerText || '').trim();
};

export const sanitizeRichContent = (html = '') => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const allowedTags = new Set([
    'P',
    'DIV',
    'BR',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'H1',
    'H2',
    'H3',
    'H4',
    'UL',
    'OL',
    'LI',
    'A',
    'BLOCKQUOTE'
  ]);

  const walk = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName;

      if (!allowedTags.has(tagName)) {
        const fragment = document.createDocumentFragment();
        const extractedChildren = [];

        while (node.firstChild) {
          const child = node.firstChild;
          extractedChildren.push(child);
          fragment.appendChild(child);
        }

        node.replaceWith(fragment);
        extractedChildren.forEach(walk);
        return;
      }

      [...node.attributes].forEach((attr) => {
        const attrName = attr.name.toLowerCase();
        if (tagName === 'A' && ['href', 'target', 'rel'].includes(attrName)) {
          return;
        }
        node.removeAttribute(attr.name);
      });

      if (tagName === 'A') {
        const href = node.getAttribute('href') || '';
        const isSafeHref = /^(https?:|mailto:|tel:|\/)/i.test(href);
        if (!isSafeHref) {
          node.removeAttribute('href');
        }
        if (node.getAttribute('target') === '_blank') {
          node.setAttribute('rel', 'noopener noreferrer');
        }
      }
    }

    [...node.childNodes].forEach(walk);
  };

  [...doc.body.childNodes].forEach(walk);
  return doc.body.innerHTML
    .replace(/\n{2,}/g, '<br /><br />')
    .replace(/\n/g, '<br />');
};
