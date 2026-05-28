import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createPresignedUpload,
  uploadFileToPresignedUrl,
  clearPublicCatalogCache,
} from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Plus, Pencil, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_IMAGE_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="#f3f0eb"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#8f8578" font-family="Arial, sans-serif" font-size="18">
        No category image
      </text>
    </svg>
  `);

const CATEGORY_IMAGE_MAX_WIDTH = 1200;
const CATEGORY_IMAGE_QUALITY = 0.82;

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const formDataRef = useRef(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  
  const parentCategoryOptions = useMemo(() => {
    return categories
      .filter((category) => !category.parent_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
  }, [categories]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: '',
    slug: '',
    parent_id: '',
    show_in_nav: false,
    sort_order: 0,
    is_active: true
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const fetchCategories = async () => {
    try {
      const data = await getAdminCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'slug') {
      setSlugManuallyEdited(true);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox'
        ? checked
        : type === 'number'
          ? Number(value)
          : value,
      ...(name === 'name' && !slugManuallyEdited ? { slug: slugify(value) } : {}),
    }));
  };

  const buildCategoryPayload = (overrides = {}) => {
    const next = {
      ...formDataRef.current,
      ...overrides,
    };

    return {
      ...next,
      parent_id: next.parent_id || null,
    };
  };

  const validateCategoryImageFile = (file) => {
    if (!file) return false;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, WEBP or GIF image');
      return false;
    }

    const maxSizeBytes = 30 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error('Image size must be 30MB or less');
      return false;
    }

    return true;
  };

  const isGifFile = (file) => file?.type === 'image/gif';

  const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });

  const loadImageForOptimization = (src) => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  };

  const createOptimizedCategoryImageFile = async (file) => {
    if (!file || isGifFile(file)) return file;

    const sourceUrl = URL.createObjectURL(file);
    let image;
    try {
      image = await loadImageForOptimization(sourceUrl);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }

    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, CATEGORY_IMAGE_MAX_WIDTH / imageWidth);
    const outputWidth = Math.round(imageWidth * scale);
    const outputHeight = Math.round(imageHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Image optimization is not supported in this browser');
    }

    context.drawImage(image, 0, 0, outputWidth, outputHeight);

    let outputType = 'image/webp';
    let blob = await canvasToBlob(canvas, outputType, CATEGORY_IMAGE_QUALITY);

    if (!blob || blob.type !== outputType) {
      outputType = 'image/jpeg';
      blob = await canvasToBlob(canvas, outputType, CATEGORY_IMAGE_QUALITY);
    }

    if (!blob) return null;

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const extension = outputType === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${baseName}.${extension}`, { type: outputType });
  };

  const prepareCategoryImageFile = async (file) => {
    if (!file) return;

    if (!validateCategoryImageFile(file)) return;

    try {
      const uploadFile = isGifFile(file) ? file : await createOptimizedCategoryImageFile(file);
      if (!uploadFile) {
        toast.error('Failed to optimize image');
        return;
      }

      await uploadCategoryOptimizedImageFile(uploadFile);
    } catch (error) {
      console.error('Error optimizing category image:', error);
      toast.error('Failed to optimize image');
    }
  };

  const uploadCategoryOptimizedImageFile = async (file) => {
    if (!file) return;

    if (!validateCategoryImageFile(file)) return;

    try {
      setUploadingImage(true);

      const presigned = await createPresignedUpload({
        filename: file.name,
        content_type: file.type,
        folder: 'categories/images',
      });

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        file,
        presigned.content_type,
        presigned.cache_control
      );

      const uploadedImageUrl = presigned.file_url;

      setFormData((prev) => ({
        ...prev,
        image: uploadedImageUrl,
      }));

      if (editingCategory) {
        await updateCategory(
          editingCategory.id,
          buildCategoryPayload({ image: uploadedImageUrl })
        );
        clearPublicCatalogCache('categories');

        setEditingCategory((prev) => prev ? { ...prev, image: uploadedImageUrl } : prev);
        setCategories((prev) =>
          prev.map((category) =>
            category.id === editingCategory.id
              ? { ...category, image: uploadedImageUrl }
              : category
          )
        );
        await fetchCategories();

        toast.success('Category image uploaded and saved');
      } else {
        toast.success('Category image uploaded. Complete the form and create the category to save it.');
      }
    } catch (error) {
      console.error('Error uploading category image:', error);
      toast.error('Failed to upload category image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCategoryImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await prepareCategoryImageFile(file);
    e.target.value = '';
  };

  const handleCategoryImageDrop = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    await prepareCategoryImageFile(file);
  };

  const removeCategoryImage = async () => {
    const previousImage = formDataRef.current.image || '';

    if (!editingCategory) {
      setFormData((prev) => ({
        ...prev,
        image: '',
      }));
      return;
    }

    try {
      await updateCategory(
        editingCategory.id,
        buildCategoryPayload({ image: '' })
      );
      clearPublicCatalogCache('categories');

      setFormData((prev) => ({
        ...prev,
        image: '',
      }));
      setEditingCategory((prev) => prev ? { ...prev, image: '' } : prev);
      setCategories((prev) =>
        prev.map((category) =>
          category.id === editingCategory.id
            ? { ...category, image: '' }
            : category
        )
      );
      await fetchCategories();
      toast.success('Category image removed');
    } catch (error) {
      console.error('Error removing category image:', error);
      setFormData((prev) => ({
        ...prev,
        image: previousImage,
      }));
      toast.error('Failed to remove category image');
    }
  };

  const getParentCategoryName = (parentId) => {
    if (!parentId) return 'Top-level category';
    return categories.find((category) => category.id === parentId)?.name || 'Unknown parent';
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setSlugManuallyEdited(false);
    setFormData({
      name: '',
      description: '',
      image: '',
      slug: '',
      parent_id: '',
      show_in_nav: false,
      sort_order: 0,
      is_active: true
    });
    setDialogOpen(true);
  };

  const openEditDialog = (category) => {
    setEditingCategory(category);
    setSlugManuallyEdited(Boolean(category.slug));
    setFormData({
      name: category.name || '',
      description: category.description || '',
      image: category.image || '',
      slug: category.slug || '',
      parent_id: category.parent_id || '',
      show_in_nav: !!category.show_in_nav,
      sort_order: Number(category.sort_order || 0),
      is_active: category.is_active !== false
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...formData,
        slug: slugManuallyEdited ? formData.slug : '',
        parent_id: formData.parent_id || null
      };
      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
        toast.success('Category updated successfully');
      } else {
        await createCategory(payload);
        toast.success('Category created successfully');
      }
      clearPublicCatalogCache('categories');
      setDialogOpen(false);
      fetchCategories();
    } catch (error) {
      toast.error('Failed to save category');
    }
  };

  const handleDelete = async (categoryId) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    
    try {
      await deleteCategory(categoryId);
      toast.success('Category deleted');
      clearPublicCatalogCache('categories');
      fetchCategories();
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  return (
    <div data-testid="admin-categories">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-heading text-3xl">Categories</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <div className="w-full sm:w-auto">
              <Button onClick={openCreateDialog} className="btn-primary w-full sm:w-auto" data-testid="add-category-button">
                <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                Add Category
              </Button>
            </div>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-4 sm:max-w-[520px] sm:p-6">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Label htmlFor="name">Category Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="mt-1"
                  data-testid="category-name-input"
                />
              </div>
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  value={formData.slug}
                  onChange={handleChange}
                  placeholder="candles"
                  className="mt-1"
                  data-testid="category-slug-input"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Used in category URL. Leave blank to auto-generate.
                </p>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="mt-1"
                  data-testid="category-description-input"
                />
              </div>
              <div>
                <Label htmlFor="parent_id">Parent Category</Label>
                <select
                  id="parent_id"
                  name="parent_id"
                  value={formData.parent_id}
                  onChange={handleChange}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="category-parent-select"
                >
                  <option value="">No parent (Top-level category)</option>
                  {parentCategoryOptions
                    .filter((category) => category.id !== editingCategory?.id)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Category Image</Label>
                    <p className="text-xs text-muted-foreground">
                      Upload JPG, PNG, WEBP or GIF image, up to 30MB. Non-GIF images are resized and optimized before upload.
                    </p>
                  </div>
                </div>

                <Input
                  id="category-image-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleCategoryImageUpload}
                  className="hidden"
                  disabled={uploadingImage}
                  data-testid="category-image-upload-input"
                />

                {!formData.image ? (
                  <div
                    className="rounded-lg border-2 border-dashed p-4 text-center transition-colors hover:border-primary/50"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleCategoryImageDrop}
                  >
                    <ImageIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-sm font-medium">Drag and drop category image here</p>
                    <p className="mb-3 text-xs text-muted-foreground">or upload from your device</p>

                    <label htmlFor="category-image-upload">
                      <div className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                        <Upload className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        {uploadingImage ? 'Uploading...' : 'Choose Image'}
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="overflow-hidden rounded-lg border bg-muted">
                      <img
                        src={formData.image}
                        alt="Category preview"
                        className="aspect-square w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = CATEGORY_IMAGE_FALLBACK;
                        }}
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label htmlFor="category-image-upload">
                        <div className="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted sm:w-auto">
                          {uploadingImage ? 'Uploading...' : 'Replace'}
                        </div>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={removeCategoryImage}
                        className="w-full sm:w-auto"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  name="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={handleChange}
                  className="mt-1"
                  data-testid="category-sort-order-input"
                />
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="show_in_nav"
                    checked={formData.show_in_nav}
                    onChange={handleChange}
                    data-testid="category-show-in-nav-checkbox"
                  />
                  <span>Show in navigation</span>
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleChange}
                    data-testid="category-is-active-checkbox"
                  />
                  <span>Category is active</span>
                </label>
              </div>
              <Button type="submit" className="btn-primary w-full" data-testid="save-category-button">
                {editingCategory ? 'Update Category' : 'Create Category'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Categories Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-6 card-shadow animate-pulse">
              <div className="h-32 bg-muted rounded-lg mb-4" />
              <div className="h-6 bg-muted rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl card-shadow">
          <p className="text-muted-foreground">No categories found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => (
            <div 
              key={category.id} 
              className="bg-white rounded-xl overflow-hidden card-shadow group"
              data-testid={`category-card-${category.id}`}
            >
              <div className="relative h-40 overflow-hidden">
                <img
                  src={category.image || CATEGORY_IMAGE_FALLBACK}
                  alt={category.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = CATEGORY_IMAGE_FALLBACK;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />
                <h3 className="absolute bottom-4 left-4 font-heading text-xl text-white">
                  {category.name}
                </h3>
              </div>
              <div className="p-4">
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {category.description || 'No description'}
                </p>
                <div className="space-y-1 text-xs text-muted-foreground mb-4">
                  <p><span className="font-medium text-foreground">Slug:</span> {category.slug || '—'}</p>
                  <p><span className="font-medium text-foreground">Type:</span> {category.parent_id ? 'Child category' : 'Top-level category'}</p>
                  <p><span className="font-medium text-foreground">Parent:</span> {getParentCategoryName(category.parent_id)}</p>
                  <p><span className="font-medium text-foreground">Show in Nav:</span> {category.show_in_nav ? 'Yes' : 'No'}</p>
                  <p><span className="font-medium text-foreground">Active:</span> {category.is_active !== false ? 'Yes' : 'No'}</p>
                  <p><span className="font-medium text-foreground">Sort Order:</span> {category.sort_order || 0}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(category)}
                    className="flex-1"
                    data-testid={`edit-category-${category.id}`}
                  >
                    <Pencil className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(category.id)}
                    className="text-destructive hover:text-destructive"
                    data-testid={`delete-category-${category.id}`}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCategories;
