import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Copy, Gift, Home, Loader2, ShoppingBag, Sparkles, Star } from 'lucide-react';
import { toast } from 'sonner';

import Layout from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { getFeedbackForm, submitFeedback } from '../lib/api';
import { formatINR } from '../lib/currency';

const ORDER_ITEM_IMAGE_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="120" viewBox="0 0 100 120">
      <rect width="100" height="120" rx="14" fill="#f3f0eb"/>
      <text x="50" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#9c8f82">No image</text>
      <text x="50" y="74" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#b5a89c">Mariso</text>
    </svg>
  `);

const formatDate = (value) => {
  if (!value) return 'Not available';

  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatDiscount = (reward) => {
  if (!reward) return '';
  if (reward.discount_type === 'percentage') {
    return `${reward.discount_value}% off`;
  }
  return `${formatINR(reward.discount_value)} off`;
};

const normalizeQuestionType = (type) => {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'choice') return 'single_choice';
  return normalized || 'textarea';
};

const getInitialAnswer = (question) => (
  normalizeQuestionType(question?.question_type) === 'multiple_choice' ? [] : ''
);

const FeedbackPage = () => {
  const { feedbackToken } = useParams();
  const [formData, setFormData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reward, setReward] = useState(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadFeedbackForm = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await getFeedbackForm(feedbackToken);
        if (!isMounted) return;

        const questions = data?.questions || [];
        const initialAnswers = questions.reduce((nextAnswers, question) => {
          nextAnswers[question.id] = getInitialAnswer(question);
          return nextAnswers;
        }, {});

        setFormData(data);
        setAnswers(initialAnswers);
        setReward(data?.reward || null);
        setAlreadySubmitted(Boolean(data?.already_submitted));
      } catch (loadError) {
        console.error('Error loading feedback form:', loadError);
        if (isMounted) {
          setError('This feedback link is invalid, expired, or not ready yet.');
          setFormData(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (feedbackToken) {
      loadFeedbackForm();
    } else {
      setError('This feedback link is invalid, expired, or not ready yet.');
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [feedbackToken]);

  const questions = useMemo(() => formData?.questions || [], [formData]);
  const order = formData?.order || {};

  const updateAnswer = (questionId, value) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: value,
    }));
  };

  const toggleMultipleChoice = (questionId, option) => {
    setAnswers((current) => {
      const selected = Array.isArray(current[questionId]) ? current[questionId] : [];
      const nextSelected = selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option];
      return {
        ...current,
        [questionId]: nextSelected,
      };
    });
  };

  const validateRequiredAnswers = () => (
    questions.every((question) => {
      if (!question.is_required) return true;
      const value = answers[question.id];
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && String(value).trim() !== '';
    })
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || alreadySubmitted) return;

    if (!validateRequiredAnswers()) {
      toast.error('Please answer the required questions.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        answers: questions.map((question) => ({
          question_id: question.id,
          question: question.question,
          answer: answers[question.id] ?? getInitialAnswer(question),
        })),
        rating: rating || null,
        review_text: reviewText,
      };
      const response = await submitFeedback(feedbackToken, payload);
      setReward(response?.reward || null);
      setAlreadySubmitted(true);
      toast.success('Thank you for sharing your feedback.');
    } catch (submitError) {
      console.error('Error submitting feedback:', submitError);
      const message = submitError?.response?.data?.detail || 'Unable to submit feedback. Please try again.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyCouponCode = async () => {
    if (!reward?.coupon_code) return;

    try {
      await navigator.clipboard.writeText(reward.coupon_code);
      setCopied(true);
      toast.success('Coupon code copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error('Unable to copy coupon code:', copyError);
      toast.error('Unable to copy code.');
    }
  };

  const renderQuestion = (question) => {
    const questionType = normalizeQuestionType(question.question_type);
    const value = answers[question.id];

    if (questionType === 'rating') {
      return (
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              onClick={() => updateAnswer(question.id, score)}
              className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
                Number(value) >= score
                  ? 'border-[#C98E74] bg-[#C98E74] text-white'
                  : 'border-border bg-white text-muted-foreground hover:border-[#C98E74]/60'
              }`}
              aria-label={`${score} out of 5`}
            >
              <Star className="h-4 w-4" fill={Number(value) >= score ? 'currentColor' : 'none'} strokeWidth={1.6} />
            </button>
          ))}
        </div>
      );
    }

    if (questionType === 'text') {
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(event) => updateAnswer(question.id, event.target.value)}
          className="h-12 w-full rounded-lg border border-border bg-white px-4 text-sm outline-none transition focus:border-[#C98E74]"
        />
      );
    }

    if (questionType === 'single_choice') {
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(question.options || []).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => updateAnswer(question.id, option)}
              className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
                value === option
                  ? 'border-[#C98E74] bg-[#C98E74]/10 text-foreground'
                  : 'border-border bg-white text-muted-foreground hover:border-[#C98E74]/60'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      );
    }

    if (questionType === 'multiple_choice') {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(question.options || []).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => toggleMultipleChoice(question.id, option)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition ${
                selected.includes(option)
                  ? 'border-[#C98E74] bg-[#C98E74]/10 text-foreground'
                  : 'border-border bg-white text-muted-foreground hover:border-[#C98E74]/60'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                selected.includes(option) ? 'border-[#C98E74] bg-[#C98E74] text-white' : 'border-border'
              }`}>
                {selected.includes(option) ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
              </span>
              {option}
            </button>
          ))}
        </div>
      );
    }

    if (questionType === 'yes_no') {
      return (
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          {[
            ['Yes', true],
            ['No', false],
          ].map(([label, optionValue]) => (
            <button
              key={label}
              type="button"
              onClick={() => updateAnswer(question.id, optionValue)}
              className={`rounded-lg border px-4 py-3 text-sm transition ${
                value === optionValue
                  ? 'border-[#C98E74] bg-[#C98E74]/10 text-foreground'
                  : 'border-border bg-white text-muted-foreground hover:border-[#C98E74]/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      );
    }

    return (
      <textarea
        value={value || ''}
        onChange={(event) => updateAnswer(question.id, event.target.value)}
        rows={4}
        className="w-full resize-none rounded-lg border border-border bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#C98E74]"
      />
    );
  };

  return (
    <Layout>
      <div className="min-h-screen bg-[#F8F5F1] pt-28 pb-20 text-foreground">
        <div className="mx-auto max-w-5xl px-5 md:px-8">
          <div className="mb-10">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Mariso Feedback
            </p>
            <h1 className="mt-3 font-heading text-4xl leading-tight md:text-5xl">
              Tell Us How It Felt
            </h1>
          </div>

          {loading ? (
            <div className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
              <div className="animate-pulse space-y-5">
                <div className="h-5 w-36 rounded bg-muted" />
                <div className="h-10 w-2/3 rounded bg-muted" />
                <div className="h-24 rounded-lg bg-muted" />
                <div className="h-40 rounded-lg bg-muted" />
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-black/5 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#F3EFE8]">
                <Gift className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <h2 className="font-heading text-2xl">Feedback link unavailable</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                This feedback link may be invalid, expired, or not ready for review yet.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild className="btn-primary">
                  <Link to="/shop">
                    <ShoppingBag className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Shop
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">
                    <Home className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Home
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-6">
                <section className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Order Number</p>
                      <h2 className="mt-1 font-heading text-3xl">#{order.order_number}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Delivered on {formatDate(order.delivered_at)}
                      </p>
                    </div>
                    <div className="rounded-full border border-[#8B9D83]/30 bg-[#8B9D83]/15 px-3 py-1 text-sm font-medium text-[#53634B]">
                      Delivered
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {(order.items || []).slice(0, 3).map((item, index) => (
                      <div key={`${item.product_name}-${index}`} className="flex gap-4 border-t border-border pt-4">
                        <img
                          src={item.product_image || ORDER_ITEM_IMAGE_FALLBACK}
                          alt={item.product_name || 'Mariso item'}
                          className="h-20 w-16 shrink-0 rounded-lg border border-border bg-muted object-cover"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = ORDER_ITEM_IMAGE_FALLBACK;
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-6">{item.product_name || 'Mariso item'}</p>
                          {(item.color_name || item.flavor_name) ? (
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {[item.color_name ? `Color: ${item.color_name}` : null, item.flavor_name ? `Fragrance: ${item.flavor_name}` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          ) : null}
                          <p className="mt-1 text-sm text-muted-foreground">Qty: {item.quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {alreadySubmitted ? (
                  <section className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#8B9D83]/15 text-[#53634B]">
                        <Check className="h-5 w-5" strokeWidth={1.8} />
                      </div>
                      <div>
                        <h2 className="font-heading text-2xl">Feedback received</h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Thank you for taking the time to share your experience with Mariso.
                        </p>
                      </div>
                    </div>
                  </section>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <section className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
                      <h2 className="font-heading text-2xl">Your Experience</h2>
                      <div className="mt-6 space-y-8">
                        {questions.map((question) => (
                          <div key={question.id}>
                            <label className="block text-sm font-medium leading-6">
                              {question.question}
                              {question.is_required ? <span className="ml-1 text-[#C98E74]">*</span> : null}
                            </label>
                            <div className="mt-3">{renderQuestion(question)}</div>
                          </div>
                        ))}

                        <div>
                          <label className="block text-sm font-medium leading-6">Overall rating</label>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {[1, 2, 3, 4, 5].map((score) => (
                              <button
                                key={score}
                                type="button"
                                onClick={() => setRating(score)}
                                className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
                                  rating >= score
                                    ? 'border-[#C98E74] bg-[#C98E74] text-white'
                                    : 'border-border bg-white text-muted-foreground hover:border-[#C98E74]/60'
                                }`}
                                aria-label={`${score} overall rating`}
                              >
                                <Star className="h-4 w-4" fill={rating >= score ? 'currentColor' : 'none'} strokeWidth={1.6} />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label htmlFor="review_text" className="block text-sm font-medium leading-6">
                            Leave a review
                          </label>
                          <textarea
                            id="review_text"
                            value={reviewText}
                            onChange={(event) => setReviewText(event.target.value)}
                            rows={5}
                            className="mt-3 w-full resize-none rounded-lg border border-border bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#C98E74]"
                            placeholder="Tell us what you loved, what could be better, or how the product felt in your space."
                          />
                        </div>
                      </div>
                    </section>

                    <Button type="submit" className="btn-primary w-full sm:w-auto" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.7} />
                          Submitting
                        </>
                      ) : (
                        'Submit Feedback'
                      )}
                    </Button>
                  </form>
                )}
              </div>

              <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
                {reward ? (
                  <section className="rounded-xl border border-[#C98E74]/25 bg-white p-6 shadow-sm">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#C98E74]/12 text-[#9C6B5B]">
                      <Sparkles className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Your Reward
                    </p>
                    <h2 className="mt-2 font-heading text-3xl">{formatDiscount(reward)}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Valid until {formatDate(reward.expiry_date)}
                    </p>

                    <div className="mt-5 rounded-lg border border-dashed border-[#C98E74]/45 bg-[#F8F5F1] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Coupon Code</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="break-all font-mono text-lg font-semibold tracking-wide">
                          {reward.coupon_code}
                        </span>
                        <button
                          type="button"
                          onClick={copyCouponCode}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-white text-foreground transition hover:border-[#C98E74]"
                          aria-label="Copy coupon code"
                        >
                          {copied ? <Check className="h-4 w-4" strokeWidth={1.8} /> : <Copy className="h-4 w-4" strokeWidth={1.6} />}
                        </button>
                      </div>
                    </div>

                    <Button asChild className="btn-primary mt-5 w-full">
                      <Link to="/shop">
                        <ShoppingBag className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        Shop Now
                      </Link>
                    </Button>
                  </section>
                ) : (
                  <section className="rounded-xl border border-black/5 bg-white p-6 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Thank You
                    </p>
                    <h2 className="mt-2 font-heading text-2xl">Your note helps us craft better moments.</h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Submit your feedback to see whether this order has a reward available.
                    </p>
                  </section>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default FeedbackPage;
