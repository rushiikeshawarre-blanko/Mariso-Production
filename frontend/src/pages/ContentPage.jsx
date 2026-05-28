import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getContentPageBySlug } from '../lib/api';

const ContentPage = () => {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sanitizeRichContent = (html = '') => {
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

  useEffect(() => {
    const fetchPage = async () => {
      if (!slug) {
        setError('Page not found.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const data = await getContentPageBySlug(slug);
        setPage(data || null);
      } catch (err) {
        console.error('Error fetching content page:', err);
        if (err?.response?.status === 404) {
          setError('This page is not available.');
        } else {
          setError('Unable to load this page right now. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [slug]);

  return (
    <div className="min-h-screen bg-[#F8F3EF] pt-8 text-[#211816] md:pt-10">
      <style>{`
        .content-page-rich-text h1,
        .content-page-rich-text h2,
        .content-page-rich-text h3,
        .content-page-rich-text h4 {
          color: #3F362F;
          font-weight: 600;
          line-height: 1.6;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
        }

        .content-page-rich-text h1 { font-size: 1.65rem; }
        .content-page-rich-text h2 { font-size: 1.35rem; }
        .content-page-rich-text h3 { font-size: 1.08rem; }
        .content-page-rich-text h4 { font-size: 1rem; }

        .content-page-rich-text p,
        .content-page-rich-text div,
        .content-page-rich-text li,
        .content-page-rich-text blockquote {
          font-size: 15px;
          line-height: 2.05;
          color: #4F453F;
        }

        .content-page-rich-text br {
          display: block;
          content: '';
          margin-top: 0.55rem;
        }

        .content-page-rich-text p,
        .content-page-rich-text div,
        .content-page-rich-text ul,
        .content-page-rich-text ol,
        .content-page-rich-text blockquote {
          margin-top: 0.75rem;
        }

        .content-page-rich-text ul,
        .content-page-rich-text ol {
          padding-left: 1.4rem;
        }

        .content-page-rich-text ul {
          list-style-type: disc;
        }

        .content-page-rich-text ol {
          list-style-type: decimal;
        }

        .content-page-rich-text li {
          display: list-item;
        }

        .content-page-rich-text a {
          color: #8D6E63;
          text-decoration: underline;
        }

        .content-page-rich-text strong,
        .content-page-rich-text b {
          color: #3F362F;
          font-weight: 600;
        }
      `}</style>
      <div className="mx-auto max-w-4xl px-6 py-10 md:px-10 md:py-12 lg:px-12">

        {loading ? (
          <div className="rounded-2xl border border-[#E7DDD6] bg-white px-6 py-12 text-center text-sm text-[#6F625C] shadow-sm">
            Loading page...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : !page ? (
          <div className="rounded-2xl border border-[#E7DDD6] bg-white px-6 py-12 text-center text-sm text-[#6F625C] shadow-sm">
            This page is not available.
          </div>
        ) : (
          <article className="rounded-[2rem] border border-[#E7DDD6] bg-white px-6 py-10 shadow-sm md:px-10 md:py-12">
            <header className="border-b border-[#F0E7DF] pb-6 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-[#8D6E63]">
                Help Center
              </p>
              <h1 className="mt-4 font-serif text-4xl leading-tight md:text-5xl">
                {page.title}
              </h1>
            </header>

            <div
              className="content-page-rich-text mt-8 max-w-none text-[#4F453F]"
              dangerouslySetInnerHTML={{ __html: sanitizeRichContent(page.content || '') }}
            />
          </article>
        )}
      </div>
    </div>
  );
};

export default ContentPage;
