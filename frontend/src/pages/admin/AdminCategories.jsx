import React, { useState, useEffect, useMemo } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  
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

  const fetchCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox'
        ? checked
        : type === 'number'
          ? Number(value)
          : value
    }));
  };

  const getParentCategoryName = (parentId) => {
    if (!parentId) return 'Top-level category';
    return categories.find((category) => category.id === parentId)?.name || 'Unknown parent';
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
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
        parent_id: formData.parent_id || null
      };
      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
        toast.success('Category updated successfully');
      } else {
        await createCategory(payload);
        toast.success('Category created successfully');
      }
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
      fetchCategories();
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  return (
    <div data-testid="admin-categories">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-heading text-3xl">Categories</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="btn-primary" data-testid="add-category-button">
              <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
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
              <div>
                <Label htmlFor="image">Image URL</Label>
                <Input
                  id="image"
                  name="image"
                  value={formData.image}
                  onChange={handleChange}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1"
                  data-testid="category-image-input"
                />
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
                  src={category.image || 'https://via.placeholder.com/400x300'}
                  alt={category.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
                <div className="flex gap-2">
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
