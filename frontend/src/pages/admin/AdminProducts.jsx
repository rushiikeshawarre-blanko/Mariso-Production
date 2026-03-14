import React, { useState, useEffect } from 'react';
import { getProducts, getCategories, createProduct, updateProduct, deleteProduct } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Plus, Pencil, Trash2, Search, Palette, Droplets, X, Image, GripVertical, ChevronUp, ChevronDown, Package, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = process.env.REACT_APP_BACKEND_URL;

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('basic');
  const [generating, setGenerating] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    short_description: '',
    price: '',
    discount_price: '',
    category_id: '',
    sku: '',
    stock: '',
    images: '',
    is_on_sale: false,
    is_featured: false,
    is_bestseller: false,
    is_new_arrival: false,
    is_active: true,
    care_instructions: '',
    shipping_info: '',
    materials: '',
    dimensions: '',
    burn_time: '',
    has_color_options: false,
    has_flavor_options: false,
    color_options: [],
    flavor_options: [],
    variants: []
  });

  // Temporary state for adding new color/flavor
  const [newColor, setNewColor] = useState({ name: '', hex_code: '#F5F0E8', hex_code_secondary: '', images: ['', '', '', '', ''] });
  const [newFlavor, setNewFlavor] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [prods, cats] = await Promise.all([
        getProducts(),
        getCategories()
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      short_description: '',
      price: '',
      discount_price: '',
      category_id: '',
      sku: '',
      stock: '',
      images: '',
      is_on_sale: false,
      is_featured: false,
      is_bestseller: false,
      is_new_arrival: false,
      is_active: true,
      care_instructions: '',
      shipping_info: '',
      materials: '',
      dimensions: '',
      burn_time: '',
      has_color_options: false,
      has_flavor_options: false,
      color_options: [],
      flavor_options: [],
      variants: []
    });
    setNewColor({ name: '', hex_code: '#F5F0E8', images: ['', '', '', '', ''] });
    setNewFlavor({ name: '', description: '' });
    setActiveTab('basic');
  };

  const openCreateDialog = () => {
    setEditingProduct(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      short_description: product.short_description || '',
      price: product.price.toString(),
      discount_price: product.discount_price?.toString() || '',
      category_id: product.category_id,
      sku: product.sku || '',
      stock: product.stock.toString(),
      images: product.images?.join(', ') || '',
      is_on_sale: product.is_on_sale || false,
      is_featured: product.is_featured || false,
      is_bestseller: product.is_bestseller || false,
      is_new_arrival: product.is_new_arrival || false,
      is_active: product.is_active !== false,
      care_instructions: product.care_instructions || '',
      shipping_info: product.shipping_info || '',
      materials: product.materials || '',
      dimensions: product.dimensions || '',
      burn_time: product.burn_time || '',
      has_color_options: product.has_color_options || false,
      has_flavor_options: product.has_flavor_options || false,
      color_options: product.color_options || [],
      flavor_options: product.flavor_options || [],
      variants: product.variants || []
    });
    setActiveTab('basic');
    setDialogOpen(true);
  };

  // ==================== COLOR OPTIONS ====================
  
  const addColorOption = () => {
    if (!newColor.name.trim()) {
      toast.error('Color name is required');
      return;
    }
    const colorImages = newColor.images.filter(url => url.trim() !== '');
    const newColorOption = {
      id: `temp-${Date.now()}`,
      name: newColor.name,
      hex_code: newColor.hex_code,
      hex_code_secondary: newColor.hex_code_secondary || null,
      images: colorImages
    };
    setFormData({
      ...formData,
      color_options: [...formData.color_options, newColorOption]
    });
    setNewColor({ name: '', hex_code: '#F5F0E8', hex_code_secondary: '', images: ['', '', '', '', ''] });
    toast.success('Color option added');
  };

  const removeColorOption = (index) => {
    const colorToRemove = formData.color_options[index];
    // Also remove variants that use this color
    const updatedVariants = formData.variants.filter(v => v.color_id !== colorToRemove.id);
    setFormData({
      ...formData,
      color_options: formData.color_options.filter((_, i) => i !== index),
      variants: updatedVariants
    });
    toast.success('Color option removed');
  };

  const updateColorImage = (colorIndex, imageIndex, url) => {
    const updatedColors = [...formData.color_options];
    if (!updatedColors[colorIndex].images) {
      updatedColors[colorIndex].images = ['', '', '', '', ''];
    }
    // Ensure we have 5 slots
    while (updatedColors[colorIndex].images.length < 5) {
      updatedColors[colorIndex].images.push('');
    }
    updatedColors[colorIndex].images[imageIndex] = url;
    setFormData({ ...formData, color_options: updatedColors });
  };

  const moveColorImage = (colorIndex, imageIndex, direction) => {
    const updatedColors = [...formData.color_options];
    const images = [...updatedColors[colorIndex].images];
    const newIndex = direction === 'up' ? imageIndex - 1 : imageIndex + 1;
    if (newIndex >= 0 && newIndex < images.length) {
      [images[imageIndex], images[newIndex]] = [images[newIndex], images[imageIndex]];
      updatedColors[colorIndex].images = images;
      setFormData({ ...formData, color_options: updatedColors });
    }
  };

  // ==================== FLAVOR OPTIONS ====================

  const addFlavorOption = () => {
    if (!newFlavor.name.trim()) {
      toast.error('Fragrance name is required');
      return;
    }
    const newFlavorOption = {
      id: `temp-${Date.now()}`,
      name: newFlavor.name,
      description: newFlavor.description,
      images: []
    };
    setFormData({
      ...formData,
      flavor_options: [...formData.flavor_options, newFlavorOption]
    });
    setNewFlavor({ name: '', description: '' });
    toast.success('Fragrance option added');
  };

  const removeFlavorOption = (index) => {
    const flavorToRemove = formData.flavor_options[index];
    // Also remove variants that use this flavor
    const updatedVariants = formData.variants.filter(v => v.flavor_id !== flavorToRemove.id);
    setFormData({
      ...formData,
      flavor_options: formData.flavor_options.filter((_, i) => i !== index),
      variants: updatedVariants
    });
    toast.success('Fragrance option removed');
  };

  const updateFlavorOption = (index, field, value) => {
    const updatedFlavors = [...formData.flavor_options];
    updatedFlavors[index] = { ...updatedFlavors[index], [field]: value };
    setFormData({ ...formData, flavor_options: updatedFlavors });
  };

  // ==================== VARIANT COMBINATIONS ====================

  const generateVariantCombinations = async () => {
    if (editingProduct) {
      // If editing, call the API to generate variants
      setGenerating(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/api/admin/products/${editingProduct.id}/generate-variants`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const updatedProduct = await response.json();
          setFormData(prev => ({ ...prev, variants: updatedProduct.variants || [] }));
          toast.success('Variant combinations generated');
        }
      } catch (error) {
        console.error('Error generating variants:', error);
        toast.error('Failed to generate variants');
      } finally {
        setGenerating(false);
      }
    } else {
      // For new products, generate locally
      const newVariants = [];
      const existingCombos = new Set(formData.variants.map(v => `${v.color_id}-${v.flavor_id}`));
      
      if (formData.color_options.length > 0 && formData.flavor_options.length > 0) {
        // Both colors and flavors
        for (const color of formData.color_options) {
          for (const flavor of formData.flavor_options) {
            const comboKey = `${color.id}-${flavor.id}`;
            if (!existingCombos.has(comboKey)) {
              newVariants.push({
                id: `temp-${Date.now()}-${newVariants.length}`,
                color_id: color.id,
                color_name: color.name,
                flavor_id: flavor.id,
                flavor_name: flavor.name,
                sku: '',
                price_override: null,
                stock: 0,
                is_active: true
              });
            }
          }
        }
      } else if (formData.color_options.length > 0) {
        // Only colors
        for (const color of formData.color_options) {
          const comboKey = `${color.id}-null`;
          if (!existingCombos.has(comboKey)) {
            newVariants.push({
              id: `temp-${Date.now()}-${newVariants.length}`,
              color_id: color.id,
              color_name: color.name,
              flavor_id: null,
              flavor_name: null,
              sku: '',
              price_override: null,
              stock: 0,
              is_active: true
            });
          }
        }
      } else if (formData.flavor_options.length > 0) {
        // Only flavors
        for (const flavor of formData.flavor_options) {
          const comboKey = `null-${flavor.id}`;
          if (!existingCombos.has(comboKey)) {
            newVariants.push({
              id: `temp-${Date.now()}-${newVariants.length}`,
              color_id: null,
              color_name: null,
              flavor_id: flavor.id,
              flavor_name: flavor.name,
              sku: '',
              price_override: null,
              stock: 0,
              is_active: true
            });
          }
        }
      }
      
      setFormData(prev => ({ ...prev, variants: [...prev.variants, ...newVariants] }));
      toast.success(`Generated ${newVariants.length} new variant combinations`);
    }
  };

  const updateVariant = (index, field, value) => {
    const updatedVariants = [...formData.variants];
    if (field === 'stock' || field === 'price_override') {
      updatedVariants[index] = { 
        ...updatedVariants[index], 
        [field]: value === '' ? (field === 'stock' ? 0 : null) : parseFloat(value) 
      };
    } else if (field === 'is_active') {
      updatedVariants[index] = { ...updatedVariants[index], [field]: value };
    } else {
      updatedVariants[index] = { ...updatedVariants[index], [field]: value };
    }
    setFormData({ ...formData, variants: updatedVariants });
  };

  const removeVariant = (index) => {
    setFormData({
      ...formData,
      variants: formData.variants.filter((_, i) => i !== index)
    });
    toast.success('Variant removed');
  };

  // ==================== FORM SUBMISSION ====================

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Clean up color images (remove empty strings)
    const cleanedColorOptions = formData.color_options.map(color => ({
      ...color,
      images: (color.images || []).filter(url => url.trim() !== '')
    }));
    
    const productData = {
      name: formData.name,
      description: formData.description,
      short_description: formData.short_description,
      price: parseFloat(formData.price),
      discount_price: formData.discount_price ? parseFloat(formData.discount_price) : null,
      category_id: formData.category_id,
      sku: formData.sku,
      stock: parseInt(formData.stock) || 0,
      images: formData.images.split(',').map(url => url.trim()).filter(Boolean),
      is_on_sale: formData.is_on_sale,
      is_featured: formData.is_featured,
      is_bestseller: formData.is_bestseller,
      is_new_arrival: formData.is_new_arrival,
      is_active: formData.is_active,
      care_instructions: formData.care_instructions,
      shipping_info: formData.shipping_info,
      materials: formData.materials,
      dimensions: formData.dimensions,
      burn_time: formData.burn_time,
      has_color_options: formData.has_color_options,
      has_flavor_options: formData.has_flavor_options,
      color_options: formData.has_color_options ? cleanedColorOptions : [],
      flavor_options: formData.has_flavor_options ? formData.flavor_options : [],
      variants: formData.variants
    };

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
        toast.success('Product updated successfully');
      } else {
        await createProduct(productData);
        toast.success('Product created successfully');
      }
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Failed to save product');
    }
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    
    try {
      await deleteProduct(productId);
      toast.success('Product deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get variant count summary
  const getVariantSummary = (product) => {
    const variants = product.variants || [];
    const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    return { count: variants.length, totalStock };
  };

  return (
    <div data-testid="admin-products">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-heading text-3xl">Products</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="btn-primary" data-testid="add-product-button">
              <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </DialogTitle>
            </DialogHeader>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic" data-testid="tab-basic">Basic Info</TabsTrigger>
                <TabsTrigger value="colors" data-testid="tab-colors">
                  <Palette className="h-4 w-4 mr-1" /> Colors
                </TabsTrigger>
                <TabsTrigger value="fragrances" data-testid="tab-fragrances">
                  <Droplets className="h-4 w-4 mr-1" /> Fragrances
                </TabsTrigger>
                <TabsTrigger value="variants" data-testid="tab-variants">
                  <Package className="h-4 w-4 mr-1" /> Stock
                </TabsTrigger>
              </TabsList>
              
              <form onSubmit={handleSubmit}>
                {/* ==================== BASIC INFO TAB ==================== */}
                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                      <Label htmlFor="name">Product Name *</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="mt-1"
                        data-testid="product-name-input"
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <Label htmlFor="sku">SKU</Label>
                      <Input
                        id="sku"
                        name="sku"
                        value={formData.sku}
                        onChange={handleChange}
                        placeholder="Auto-generated if empty"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="short_description">Short Description</Label>
                    <Input
                      id="short_description"
                      name="short_description"
                      value={formData.short_description}
                      onChange={handleChange}
                      placeholder="Brief tagline for the product"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Full Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={3}
                      className="mt-1"
                      data-testid="product-description-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="price">Base Price (₹) *</Label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        value={formData.price}
                        onChange={handleChange}
                        required
                        className="mt-1"
                        data-testid="product-price-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="discount_price">Sale Price (₹)</Label>
                      <Input
                        id="discount_price"
                        name="discount_price"
                        type="number"
                        value={formData.discount_price}
                        onChange={handleChange}
                        className="mt-1"
                        data-testid="product-sale-price-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="stock">Base Stock</Label>
                      <Input
                        id="stock"
                        name="stock"
                        type="number"
                        value={formData.stock}
                        onChange={handleChange}
                        className="mt-1"
                        placeholder="Used if no variants"
                        data-testid="product-stock-input"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="category_id">Category *</Label>
                    <Select 
                      value={formData.category_id} 
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                    >
                      <SelectTrigger className="mt-1" data-testid="product-category-select">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="images">Default Image URLs (comma-separated)</Label>
                    <Textarea
                      id="images"
                      name="images"
                      value={formData.images}
                      onChange={handleChange}
                      placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
                      className="mt-1"
                      rows={2}
                      data-testid="product-images-input"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Used when no color-specific images exist</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.is_active}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                      />
                      <Label>Active</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.is_on_sale}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_on_sale: checked })}
                        data-testid="product-sale-toggle"
                      />
                      <Label>On Sale</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.is_featured}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
                      />
                      <Label>Featured</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.is_bestseller}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_bestseller: checked })}
                      />
                      <Label>Bestseller</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.is_new_arrival}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_new_arrival: checked })}
                      />
                      <Label>New Arrival</Label>
                    </div>
                  </div>
                  
                  {/* Additional Details */}
                  <div className="pt-4 border-t space-y-4">
                    <h3 className="font-medium">Additional Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="materials">Materials</Label>
                        <Input
                          id="materials"
                          name="materials"
                          value={formData.materials}
                          onChange={handleChange}
                          placeholder="e.g., 100% Natural Soy Wax"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dimensions">Dimensions</Label>
                        <Input
                          id="dimensions"
                          name="dimensions"
                          value={formData.dimensions}
                          onChange={handleChange}
                          placeholder="e.g., 8cm x 10cm"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="burn_time">Burn Time</Label>
                        <Input
                          id="burn_time"
                          name="burn_time"
                          value={formData.burn_time}
                          onChange={handleChange}
                          placeholder="e.g., 45+ hours"
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="care_instructions">Care Instructions</Label>
                      <Textarea
                        id="care_instructions"
                        name="care_instructions"
                        value={formData.care_instructions}
                        onChange={handleChange}
                        rows={2}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="shipping_info">Shipping Information</Label>
                      <Textarea
                        id="shipping_info"
                        name="shipping_info"
                        value={formData.shipping_info}
                        onChange={handleChange}
                        rows={2}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* ==================== COLORS TAB ==================== */}
                <TabsContent value="colors" className="space-y-6 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.has_color_options}
                        onCheckedChange={(checked) => setFormData({ ...formData, has_color_options: checked })}
                        data-testid="enable-color-options"
                      />
                      <Label className="text-base font-medium">Enable Color Options</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">{formData.color_options.length} colors</p>
                  </div>
                  
                  {formData.has_color_options && (
                    <div className="space-y-6">
                      {/* Existing Colors with Image Galleries */}
                      {formData.color_options.map((color, colorIndex) => {
                        const hasDualColor = color.hex_code_secondary && color.hex_code_secondary !== color.hex_code;
                        return (
                        <div key={color.id} className="border rounded-lg p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {/* Dual or Single color swatch preview */}
                              <div 
                                className="w-10 h-10 rounded-full border-2 border-border shadow-sm overflow-hidden"
                              >
                                {hasDualColor ? (
                                  <div 
                                    className="w-full h-full"
                                    style={{ 
                                      background: `linear-gradient(135deg, ${color.hex_code} 50%, ${color.hex_code_secondary} 50%)`
                                    }}
                                  />
                                ) : (
                                  <div 
                                    className="w-full h-full"
                                    style={{ backgroundColor: color.hex_code }}
                                  />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{color.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {color.hex_code}
                                  {hasDualColor && ` + ${color.hex_code_secondary}`}
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeColorOption(colorIndex)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {/* Image Gallery for this color (up to 5 images) */}
                          <div>
                            <Label className="text-sm mb-2 block">
                              <Image className="h-4 w-4 inline mr-1" />
                              Images for {color.name} (up to 5)
                            </Label>
                            <div className="grid grid-cols-5 gap-2">
                              {[0, 1, 2, 3, 4].map((imageIndex) => {
                                const imageUrl = color.images?.[imageIndex] || '';
                                return (
                                  <div key={imageIndex} className="space-y-1">
                                    <div className="aspect-square bg-muted rounded-lg overflow-hidden border relative group">
                                      {imageUrl ? (
                                        <>
                                          <img 
                                            src={imageUrl} 
                                            alt={`${color.name} ${imageIndex + 1}`}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                          />
                                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                            {imageIndex > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => moveColorImage(colorIndex, imageIndex, 'up')}
                                                className="p-1 bg-white rounded"
                                              >
                                                <ChevronUp className="h-3 w-3" />
                                              </button>
                                            )}
                                            {imageIndex < 4 && color.images?.[imageIndex + 1] && (
                                              <button
                                                type="button"
                                                onClick={() => moveColorImage(colorIndex, imageIndex, 'down')}
                                                className="p-1 bg-white rounded"
                                              >
                                                <ChevronDown className="h-3 w-3" />
                                              </button>
                                            )}
                                          </div>
                                        </>
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <Image className="h-6 w-6 text-muted-foreground/40" />
                                        </div>
                                      )}
                                    </div>
                                    <Input
                                      value={imageUrl}
                                      onChange={(e) => updateColorImage(colorIndex, imageIndex, e.target.value)}
                                      placeholder={`Image ${imageIndex + 1}`}
                                      className="text-xs h-7"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                      })}
                      
                      {/* Add New Color */}
                      <div className="border-2 border-dashed rounded-lg p-4 space-y-4">
                        <h4 className="font-medium text-sm">Add New Color</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={newColor.name}
                              onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                              placeholder="e.g., Blush Pink & White"
                              className="mt-1"
                              data-testid="new-color-name"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Primary Color</Label>
                              <div className="flex gap-1 mt-1">
                                <Input
                                  type="color"
                                  value={newColor.hex_code}
                                  onChange={(e) => setNewColor({ ...newColor, hex_code: e.target.value })}
                                  className="w-10 h-9 p-1 cursor-pointer"
                                />
                                <Input
                                  value={newColor.hex_code}
                                  onChange={(e) => setNewColor({ ...newColor, hex_code: e.target.value })}
                                  className="flex-1 text-xs"
                                  data-testid="new-color-hex"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Secondary Color (optional)</Label>
                              <div className="flex gap-1 mt-1">
                                <Input
                                  type="color"
                                  value={newColor.hex_code_secondary || '#FFFFFF'}
                                  onChange={(e) => setNewColor({ ...newColor, hex_code_secondary: e.target.value })}
                                  className="w-10 h-9 p-1 cursor-pointer"
                                />
                                <Input
                                  value={newColor.hex_code_secondary || ''}
                                  onChange={(e) => setNewColor({ ...newColor, hex_code_secondary: e.target.value })}
                                  placeholder="Leave empty for single"
                                  className="flex-1 text-xs"
                                  data-testid="new-color-hex-secondary"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Preview dual color */}
                        {newColor.name && (
                          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                            <span className="text-xs text-muted-foreground">Preview:</span>
                            <div className="w-8 h-8 rounded-full border overflow-hidden">
                              {newColor.hex_code_secondary ? (
                                <div 
                                  className="w-full h-full"
                                  style={{ 
                                    background: `linear-gradient(135deg, ${newColor.hex_code} 50%, ${newColor.hex_code_secondary} 50%)`
                                  }}
                                />
                              ) : (
                                <div 
                                  className="w-full h-full"
                                  style={{ backgroundColor: newColor.hex_code }}
                                />
                              )}
                            </div>
                            <span className="text-xs">{newColor.name}</span>
                          </div>
                        )}
                        
                        {/* Images for new color */}
                        <div>
                          <Label className="text-xs mb-2 block">Images (up to 5)</Label>
                          <div className="grid grid-cols-5 gap-2">
                            {[0, 1, 2, 3, 4].map((i) => (
                              <Input
                                key={i}
                                value={newColor.images[i] || ''}
                                onChange={(e) => {
                                  const newImages = [...newColor.images];
                                  newImages[i] = e.target.value;
                                  setNewColor({ ...newColor, images: newImages });
                                }}
                                placeholder={`Image ${i + 1}`}
                                className="text-xs"
                              />
                            ))}
                          </div>
                        </div>
                        
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addColorOption}
                          className="w-full"
                          data-testid="add-color-button"
                        >
                          <Plus className="h-4 w-4 mr-2" /> Add Color
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ==================== FRAGRANCES TAB ==================== */}
                <TabsContent value="fragrances" className="space-y-6 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.has_flavor_options}
                        onCheckedChange={(checked) => setFormData({ ...formData, has_flavor_options: checked })}
                        data-testid="enable-flavor-options"
                      />
                      <Label className="text-base font-medium">Enable Fragrance Options</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">{formData.flavor_options.length} fragrances</p>
                  </div>
                  
                  {formData.has_flavor_options && (
                    <div className="space-y-4">
                      {/* Existing Fragrances */}
                      {formData.flavor_options.map((flavor, index) => (
                        <div key={flavor.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                          <div className="w-10 h-10 rounded-full bg-terracotta/20 flex items-center justify-center flex-shrink-0">
                            <Droplets className="h-5 w-5 text-terracotta" />
                          </div>
                          <div className="flex-1 space-y-2">
                            <Input
                              value={flavor.name}
                              onChange={(e) => updateFlavorOption(index, 'name', e.target.value)}
                              className="font-medium"
                              placeholder="Fragrance name"
                            />
                            <Input
                              value={flavor.description || ''}
                              onChange={(e) => updateFlavorOption(index, 'description', e.target.value)}
                              className="text-sm"
                              placeholder="Description (optional)"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFlavorOption(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      
                      {/* Add New Fragrance */}
                      <div className="border-2 border-dashed rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-sm">Add New Fragrance</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={newFlavor.name}
                              onChange={(e) => setNewFlavor({ ...newFlavor, name: e.target.value })}
                              placeholder="e.g., Vanilla"
                              className="mt-1"
                              data-testid="new-flavor-name"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Description</Label>
                            <Input
                              value={newFlavor.description}
                              onChange={(e) => setNewFlavor({ ...newFlavor, description: e.target.value })}
                              placeholder="Warm and comforting"
                              className="mt-1"
                              data-testid="new-flavor-description"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addFlavorOption}
                          className="w-full"
                          data-testid="add-flavor-button"
                        >
                          <Plus className="h-4 w-4 mr-2" /> Add Fragrance
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ==================== VARIANT STOCK TAB ==================== */}
                <TabsContent value="variants" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Variant Combination Stock</h3>
                      <p className="text-sm text-muted-foreground">
                        Manage stock for each color + fragrance combination
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateVariantCombinations}
                      disabled={generating || (formData.color_options.length === 0 && formData.flavor_options.length === 0)}
                      data-testid="generate-variants-button"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                      Generate Combinations
                    </Button>
                  </div>
                  
                  {formData.variants.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                      <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground">No variant combinations yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Add colors and/or fragrances, then click "Generate Combinations"
                      </p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Color</TableHead>
                            <TableHead>Fragrance</TableHead>
                            <TableHead className="w-24">SKU</TableHead>
                            <TableHead className="w-28">Price Override</TableHead>
                            <TableHead className="w-24">Stock</TableHead>
                            <TableHead className="w-20">Active</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.variants.map((variant, index) => {
                            const colorOption = formData.color_options.find(c => c.id === variant.color_id);
                            const hasDualColor = colorOption?.hex_code_secondary && colorOption?.hex_code_secondary !== colorOption?.hex_code;
                            return (
                            <TableRow key={variant.id} data-testid={`variant-row-${index}`}>
                              <TableCell>
                                {variant.color_name ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full border overflow-hidden">
                                      {hasDualColor ? (
                                        <div 
                                          className="w-full h-full"
                                          style={{ 
                                            background: `linear-gradient(135deg, ${colorOption.hex_code} 50%, ${colorOption.hex_code_secondary} 50%)`
                                          }}
                                        />
                                      ) : (
                                        <div 
                                          className="w-full h-full"
                                          style={{ backgroundColor: colorOption?.hex_code || '#ccc' }}
                                        />
                                      )}
                                    </div>
                                    <span>{variant.color_name}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {variant.flavor_name || <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={variant.sku || ''}
                                  onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                                  placeholder="SKU"
                                  className="h-8 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={variant.price_override || ''}
                                  onChange={(e) => updateVariant(index, 'price_override', e.target.value)}
                                  placeholder="Base"
                                  className="h-8 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={variant.stock ?? 0}
                                  onChange={(e) => updateVariant(index, 'stock', e.target.value)}
                                  className={`h-8 text-xs ${variant.stock === 0 ? 'border-destructive' : ''}`}
                                  data-testid={`variant-stock-${index}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Switch
                                  checked={variant.is_active !== false}
                                  onCheckedChange={(checked) => updateVariant(index, 'is_active', checked)}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeVariant(index)}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  
                  {/* Summary */}
                  {formData.variants.length > 0 && (
                    <div className="flex gap-4 p-4 bg-muted/50 rounded-lg text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Combinations:</span>
                        <span className="font-medium ml-2">{formData.variants.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Stock:</span>
                        <span className="font-medium ml-2">
                          {formData.variants.reduce((sum, v) => sum + (v.stock || 0), 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Out of Stock:</span>
                        <span className="font-medium ml-2 text-destructive">
                          {formData.variants.filter(v => (v.stock || 0) === 0).length}
                        </span>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Submit Buttons */}
                <div className="flex gap-3 mt-6 pt-4 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setDialogOpen(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="btn-primary flex-1" data-testid="save-product-button">
                    {editingProduct ? 'Update Product' : 'Create Product'}
                  </Button>
                </div>
              </form>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="product-search"
        />
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Total Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No products found
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => {
                const variantSummary = getVariantSummary(product);
                const displayStock = variantSummary.count > 0 ? variantSummary.totalStock : product.stock;
                
                return (
                  <TableRow key={product.id} data-testid={`product-row-${product.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <img
                          src={product.images?.[0] || 'https://via.placeholder.com/40'}
                          alt={product.name}
                          className="w-10 h-12 object-cover rounded"
                        />
                        <div>
                          <span className="font-medium block">{product.name}</span>
                          {product.sku && (
                            <span className="text-xs text-muted-foreground">{product.sku}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{product.category_name}</TableCell>
                    <TableCell>
                      {product.is_on_sale && product.discount_price ? (
                        <div>
                          <span className="text-terracotta font-medium">₹{product.discount_price.toLocaleString()}</span>
                          <span className="text-muted-foreground line-through text-sm ml-2">
                            ₹{product.price.toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <span>₹{product.price.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {product.has_color_options && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit">
                            <Palette className="h-3 w-3" /> {product.color_options?.length || 0} colors
                          </span>
                        )}
                        {product.has_flavor_options && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit">
                            <Droplets className="h-3 w-3" /> {product.flavor_options?.length || 0} fragrances
                          </span>
                        )}
                        {variantSummary.count > 0 && (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit">
                            <Package className="h-3 w-3" /> {variantSummary.count} combos
                          </span>
                        )}
                        {!product.has_color_options && !product.has_flavor_options && (
                          <span className="text-xs text-muted-foreground">No variants</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={displayStock <= 5 ? 'text-destructive font-medium' : ''}>
                        {displayStock}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {!product.is_active && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                            Inactive
                          </span>
                        )}
                        {product.is_on_sale && (
                          <span className="text-xs bg-terracotta/20 text-terracotta px-2 py-0.5 rounded-full">
                            Sale
                          </span>
                        )}
                        {product.is_featured && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            Featured
                          </span>
                        )}
                        {product.is_new_arrival && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            New
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(product)}
                        data-testid={`edit-product-${product.id}`}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(product.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`delete-product-${product.id}`}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminProducts;
