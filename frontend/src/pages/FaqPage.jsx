import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getFaqs } from '../lib/api';

const FaqPage = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openFaqId, setOpenFaqId] = useState(null);

  useEffect(() => {
    const fetchFaqs = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getFaqs();
        const items = data || [];
        setFaqs(items);
        setOpenFaqId(null);
      } catch (err) {
        console.error('Error fetching FAQs:', err);
        setError('Unable to load FAQs right now. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchFaqs();
  }, []);

  const sortedFaqs = useMemo(() => {
    return [...faqs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [faqs]);

  const toggleFaq = (faqId) => {
    setOpenFaqId((current) => (current === faqId ? null : faqId));
  };

  return (
    <div className="min-h-screen bg-[#F8F5F1] text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-10 lg:px-12">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
            Help Center
          </p>
          <h1 className="mt-4 font-heading text-4xl leading-tight tracking-tight md:text-5xl">
            Frequently Asked Questions
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground md:text-base">
            Quick answers about orders, shipping, returns, payments, and general support.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl">
          {loading ? (
            <div className="rounded-[1.5rem] border border-black/5 bg-white px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
              Loading FAQs...
            </div>
          ) : error ? (
            <div className="rounded-[1.5rem] border border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-700 shadow-sm">
              {error}
            </div>
          ) : sortedFaqs.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/5 bg-white px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
              No FAQs are available right now.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedFaqs.map((faq) => {
                const isOpen = openFaqId === faq.id;

                return (
                  <div
                    key={faq.id}
                    className="overflow-hidden rounded-[1.25rem] border border-black/5 bg-[#C7A88A] shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(faq.id)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#BE9D7C] md:px-6"
                    >
                      <span className="text-sm font-medium leading-6 text-white md:text-base">
                        {faq.question}
                      </span>
                      <span className="shrink-0 text-white">
                        {isOpen ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-white/20 bg-[#F8F5F1] px-5 py-5 md:px-6">
                        <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground md:text-base">
                          {faq.answer}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FaqPage;