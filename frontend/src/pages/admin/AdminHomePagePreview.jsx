import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/button';
import { Layout } from '../../components/layout/Layout';
import { HOMEPAGE_PREVIEW_STORAGE_KEY } from '../../lib/homePageDefaults';
import HomePage from '../HomePage';

const getPreviewDraft = () => {
  try {
    const storedDraft = sessionStorage.getItem(HOMEPAGE_PREVIEW_STORAGE_KEY);
    if (!storedDraft) return null;

    const parsedDraft = JSON.parse(storedDraft);
    return parsedDraft && typeof parsedDraft === 'object' ? parsedDraft : null;
  } catch (error) {
    console.error('Error loading homepage preview draft:', error);
    return null;
  }
};

const AdminHomePagePreview = () => {
  const [previewDraft] = useState(getPreviewDraft);

  if (!previewDraft) {
    return (
      <Layout>
        <section className="flex min-h-[70vh] items-center justify-center px-6 pt-24">
          <div className="max-w-lg rounded-2xl border border-border/70 bg-white p-8 text-center shadow-sm">
            <h1 className="font-heading text-3xl">No Homepage Preview Available</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your unsaved preview draft is not available in this tab. Return to the homepage editor and open a new preview.
            </p>
            <Button asChild className="btn-primary mt-6">
              <Link to="/admin/homepage">Back to Homepage Editor</Link>
            </Button>
          </div>
        </section>
      </Layout>
    );
  }

  return <HomePage previewContent={previewDraft} isPreview />;
};

export default AdminHomePagePreview;
