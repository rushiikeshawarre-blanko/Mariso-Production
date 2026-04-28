import React, { useEffect, useMemo, useState } from 'react';
import {
  createFaq,
  deleteFaq,
  getAdminFaqs,
  updateFaq,
} from '../../lib/api';

const initialFormState = {
  question: '',
  answer: '',
  is_active: true,
  show_on_homepage: false,
  sort_order: 0,
};

const AdminFaqs = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingFaq, setEditingFaq] = useState(null);
  const [formData, setFormData] = useState(initialFormState);

  const fetchFaqs = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminFaqs({ homepage_only: false });
      setFaqs(data || []);
    } catch (err) {
      console.error('Error fetching FAQs:', err);
      setError('Failed to load FAQs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
  }, []);

  const resetForm = () => {
    setEditingFaq(null);
    setFormData(initialFormState);
    setError('');
  };

  const openEditForm = (faq) => {
    setEditingFaq(faq);
    setFormData({
      question: faq.question || '',
      answer: faq.answer || '',
      is_active: faq.is_active !== false,
      show_on_homepage: faq.show_on_homepage === true,
      sort_order: faq.sort_order ?? 0,
    });
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const validateForm = () => {
    if (!formData.question.trim()) return 'Question is required.';
    if (!formData.answer.trim()) return 'Answer is required.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      question: formData.question.trim(),
      answer: formData.answer.trim(),
      is_active: formData.is_active,
      show_on_homepage: formData.show_on_homepage,
      sort_order: Number(formData.sort_order) || 0,
    };

    try {
      if (editingFaq) {
        await updateFaq(editingFaq.id, payload);
      } else {
        await createFaq(payload);
      }
      await fetchFaqs();
      resetForm();
    } catch (err) {
      console.error('Error saving FAQ:', err);
      setError(err?.response?.data?.detail || 'Failed to save FAQ.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (faqId) => {
    const confirmed = window.confirm('Delete this FAQ?');
    if (!confirmed) return;

    try {
      await deleteFaq(faqId);
      if (editingFaq?.id === faqId) {
        resetForm();
      }
      await fetchFaqs();
    } catch (err) {
      console.error('Error deleting FAQ:', err);
      setError(err?.response?.data?.detail || 'Failed to delete FAQ.');
    }
  };

  const filteredFaqs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return faqs;
    return faqs.filter((faq) =>
      faq.question?.toLowerCase().includes(query) ||
      faq.answer?.toLowerCase().includes(query)
    );
  }, [faqs, searchQuery]);

  return (
    <div className="space-y-6 p-4 sm:space-y-8 sm:p-6" data-testid="admin-faqs-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">FAQs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and manage FAQ items, including homepage visibility.
        </p>
      </div>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">
              {editingFaq ? 'Edit FAQ' : 'Create FAQ'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Admin can manage FAQ content and choose whether each item appears on the homepage.
            </p>
          </div>
          {editingFaq ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <form className="grid grid-cols-1 gap-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">Question</label>
            <input
              name="question"
              value={formData.question}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Do you offer cash on delivery?"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Answer</label>
            <textarea
              name="answer"
              value={formData.answer}
              onChange={handleChange}
              rows={6}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter FAQ answer here"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Sort Order</label>
              <input
                name="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium md:self-end">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
              />
              Active
            </label>

            <label className="flex items-center gap-2 text-sm font-medium md:self-end">
              <input
                type="checkbox"
                name="show_on_homepage"
                checked={formData.show_on_homepage}
                onChange={handleChange}
              />
              Show on Homepage
            </label>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingFaq ? 'Update FAQ' : 'Create FAQ'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">All FAQs</h2>
            <p className="text-sm text-muted-foreground">
              Review active/inactive FAQ items and homepage visibility.
            </p>
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs"
            className="w-full max-w-xs rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading FAQs...</p>
        ) : filteredFaqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No FAQs found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] divide-y divide-border text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Question</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Homepage</th>
                  <th className="px-3 py-3 font-medium">Sort</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFaqs.map((faq) => (
                  <tr key={faq.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium">{faq.question}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {faq.answer}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${faq.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                        {faq.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-3">{faq.show_on_homepage ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-3">{faq.sort_order ?? 0}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => openEditForm(faq)}
                          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(faq.id)}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminFaqs;