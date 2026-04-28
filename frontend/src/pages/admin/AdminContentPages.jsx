import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createContentPage,
  deleteContentPage,
  getAdminContentPages,
  updateContentPage,
} from '../../lib/api';

const initialFormState = {
  title: '',
  slug: '',
  footer_label: '',
  content: '',
  is_active: true,
  show_in_footer: true,
  sort_order: 0,
  external_url: '',
};

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const normalizeEditorHtml = (html = '') => {
  const trimmed = html.trim();
  if (!trimmed) return '';
  if (trimmed === '<br>' || trimmed === '<div><br></div>' || trimmed === '<p><br></p>') {
    return '';
  }
  return trimmed;
};

const htmlToPlainText = (html = '') => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return (container.textContent || container.innerText || '').trim();
};

const AdminContentPages = () => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPage, setEditingPage] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const editorRef = useRef(null);

  const fetchPages = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminContentPages({ footer_only: false });
      setPages(data || []);
    } catch (err) {
      console.error('Error fetching content pages:', err);
      setError('Failed to load content pages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    const nextHtml = formData.content || '';
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [formData.content]);

  const resetForm = () => {
    setEditingPage(null);
    setFormData(initialFormState);
    setError('');
  };

  const openEditForm = (page) => {
    setEditingPage(page);
    setFormData({
      title: page.title || '',
      slug: page.slug || '',
      footer_label: page.footer_label || '',
      content: page.content || '',
      is_active: page.is_active !== false,
      show_in_footer: page.show_in_footer !== false,
      sort_order: page.sort_order ?? 0,
      external_url: page.external_url || '',
    });
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      };

      if (name === 'title' && !editingPage) {
        next.slug = slugify(value);
        if (!prev.footer_label) {
          next.footer_label = value;
        }
      }

      return next;
    });
  };

  const handleEditorInput = () => {
    const html = normalizeEditorHtml(editorRef.current?.innerHTML || '');
    setFormData((prev) => ({
      ...prev,
      content: html,
    }));
  };

  const applyEditorCommand = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const handleAddLink = () => {
    const url = window.prompt('Enter the URL');
    if (!url) return;
    applyEditorCommand('createLink', url);
  };

  const validateForm = () => {
    if (!formData.title.trim()) return 'Title is required.';
    if (!slugify(formData.slug)) return 'Slug is required.';
    if (!formData.footer_label.trim()) return 'Footer label is required.';
    if (!htmlToPlainText(formData.content)) return 'Content is required.';
    if (formData.external_url && !/^https?:\/\//i.test(formData.external_url.trim())) {
      return 'External URL must start with http:// or https://';
    }
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
      title: formData.title.trim(),
      slug: slugify(formData.slug),
      footer_label: formData.footer_label.trim(),
      content: normalizeEditorHtml(formData.content),
      is_active: formData.is_active,
      show_in_footer: formData.show_in_footer,
      sort_order: Number(formData.sort_order) || 0,
      external_url: formData.external_url.trim() || null,
    };

    try {
      if (editingPage) {
        await updateContentPage(editingPage.id, payload);
      } else {
        await createContentPage(payload);
      }
      await fetchPages();
      resetForm();
    } catch (err) {
      console.error('Error saving content page:', err);
      setError(err?.response?.data?.detail || 'Failed to save content page.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pageId) => {
    const confirmed = window.confirm('Delete this content page?');
    if (!confirmed) return;

    try {
      await deleteContentPage(pageId);
      if (editingPage?.id === pageId) {
        resetForm();
      }
      await fetchPages();
    } catch (err) {
      console.error('Error deleting content page:', err);
      setError(err?.response?.data?.detail || 'Failed to delete content page.');
    }
  };

  const filteredPages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return pages;
    return pages.filter((page) =>
      page.title?.toLowerCase().includes(query) ||
      page.slug?.toLowerCase().includes(query) ||
      page.footer_label?.toLowerCase().includes(query)
    );
  }, [pages, searchQuery]);

  return (
    <div className="space-y-6 p-4 sm:space-y-8 sm:p-6" data-testid="admin-content-pages-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content Pages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and manage footer/help pages like Shipping Policy, Privacy Policy, and Contact Us.
        </p>
      </div>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">
              {editingPage ? 'Edit Content Page' : 'Create Content Page'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Admin can manage internal help and policy pages from here.
            </p>
          </div>
          {editingPage ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Shipping Policy"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Slug</label>
            <input
              name="slug"
              value={formData.slug}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="shipping-policy"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Footer Label</label>
            <input
              name="footer_label"
              value={formData.footer_label}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Shipping Info"
            />
          </div>

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

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">External URL (optional)</label>
            <input
              name="external_url"
              value={formData.external_url}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="https://example.com/contact"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Content</label>
            <div className="overflow-hidden rounded-md border bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <button
                  type="button"
                  onClick={() => applyEditorCommand('bold')}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  Bold
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorCommand('italic')}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  Italic
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorCommand('underline')}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  Underline
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorCommand('formatBlock', 'H2')}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  H2
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorCommand('formatBlock', 'H3')}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  H3
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorCommand('insertUnorderedList')}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  Bullet List
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorCommand('insertOrderedList')}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  Numbered List
                </button>
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  Link
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorCommand('removeFormat')}
                  className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                >
                  Clear Format
                </button>
              </div>

              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                className="min-h-[260px] w-full px-3 py-3 text-sm leading-7 outline-none"
                data-testid="content-page-rich-editor"
                style={{ whiteSpace: 'pre-wrap' }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Select text and use the toolbar to format it. Content is saved with formatting.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
            />
            Active
          </label>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="show_in_footer"
              checked={formData.show_in_footer}
              onChange={handleChange}
            />
            Show in Footer
          </label>

          {error ? (
            <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingPage ? 'Update Page' : 'Create Page'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">All Content Pages</h2>
            <p className="text-sm text-muted-foreground">
              Review active/inactive pages and edit footer visibility.
            </p>
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pages"
            className="w-full max-w-xs rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading content pages...</p>
        ) : filteredPages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No content pages found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] divide-y divide-border text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Title</th>
                  <th className="px-3 py-3 font-medium">Slug</th>
                  <th className="px-3 py-3 font-medium">Footer Label</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Footer</th>
                  <th className="px-3 py-3 font-medium">Sort</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPages.map((page) => (
                  <tr key={page.id}>
                    <td className="px-3 py-3 font-medium">{page.title}</td>
                    <td className="px-3 py-3 text-muted-foreground">/{page.slug}</td>
                    <td className="px-3 py-3">{page.footer_label}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          page.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {page.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-3">{page.show_in_footer ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-3">{page.sort_order ?? 0}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => openEditForm(page)}
                          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(page.id)}
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

export default AdminContentPages;