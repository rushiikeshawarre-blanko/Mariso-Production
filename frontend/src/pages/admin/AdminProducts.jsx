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
import { Plus, Pencil, Trash2, Search, Palette, Droplets, X } from 'lucide-react';
import { toast } from 'sonner';

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('basic');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    short_description: '',
    price: '',
    discount_price: '',
    category_id: '',
    stock: '',
    images: '',
    is_on_sale: false,
    is_featured: false,
    is_bestseller: false,
    is_new_arrival: false,
    care_instructions: '',
    shipping_info: '',
    materials: '',
    dimensions: '',
    burn_time: '',
    has_color_options: false,
    has_flavor_options: false,
    color_options: [],
    flavor_options: []
  });

  // Temporary state for adding new color/flavor
  const [newColor, setNewColor] = useState({ name: '', hex_code: '#F5F0E8', images: '' });
  const [newFlavor, setNewFlavor] = useState({ name: '', description: '', images: '' });

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
      stock: '',
      images: '',
      is_on_sale: false,
      is_featured: false,
      is_bestseller: false,
      is_new_arrival: false,
      care_instructions: '',
      shipping_info: '',
      materials: '',
      dimensions: '',
      burn_time: '',
      has_color_options: false,
      has_flavor_options: false,
      color_options: [],
      flavor_options: []
    });
    setNewColor({ name: '', hex_code: '#F5F0E8', images: '' });
    setNewFlavor({ name: '', description: '', images: '' });
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
      stock: product.stock.toString(),
      images: product.images?.join(', ') || '',
      is_on_sale: product.is_on_sale || false,
      is_featured: product.is_featured || false,
      is_bestseller: product.is_bestseller || false,
      is_new_arrival: product.is_new_arrival || false,
      care_instructions: product.care_instructions || '',
      shipping_info: product.shipping_info || '',
      materials: product.materials || '',
      dimensions: product.dimensions || '',
      burn_time: product.burn_time || '',
      has_color_options: product.has_color_options || false,
      has_flavor_options: product.has_flavor_options || false,
      color_options: product.color_options || [],
      flavor_options: product.flavor_options || []
    });
    setActiveTab('basic');
    setDialogOpen(true);
  };

  // Add a new color option
  const addColorOption = () => {
    if (!newColor.name.trim()) {
      toast.error('Color name is required');
      return;
    }
    const colorImages = newColor.images.split(',').map(url => url.trim()).filter(Boolean);
    setFormData({
      ...formData,
      color_options: [...formData.color_options, {
        name: newColor.name,
        hex_code: newColor.hex_code,
        images: colorImages
      }]
    });
    setNewColor({ name: '', hex_code: '#F5F0E8', images: '' });
    toast.success('Color option added');
  };

  // Remove a color option
  const removeColorOption = (index) => {
    setFormData({
      ...formData,
      color_options: formData.color_options.filter((_, i) => i !== index)
    });
  };

  // Add a new flavor option
  const addFlavorOption = () => {
    if (!newFlavor.name.trim()) {
      toast.error('Flavor name is required');
      return;
    }
    const flavorImages = newFlavor.images.split(',').map(url => url.trim()).filter(Boolean);
    setFormData({
      ...formData,
      flavor_options: [...formData.flavor_options, {
        name: newFlavor.name,
        description: newFlavor.description,
        images: flavorImages
      }]
    });
    setNewFlavor({ name: '', description: '', images: '' });
    toast.success('Flavor option added');
  };

  // Remove a flavor option
  const removeFlavorOption = (index) => {
    setFormData({
      ...formData,
      flavor_options: formData.flavor_options.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const productData = {
      name: formData.name,
      description: formData.description,
      short_description: formData.short_description,
      price: parseFloat(formData.price),
      discount_price: formData.discount_price ? parseFloat(formData.discount_price) : null,
      category_id: formData.category_id,
      stock: parseInt(formData.stock),
      images: formData.images.split(',').map(url => url.trim()).filter(Boolean),
      is_on_sale: formData.is_on_sale,
      is_featured: formData.is_featured,
      is_bestseller: formData.is_bestseller,
      is_new_arrival: formData.is_new_arrival,
      care_instructions: formData.care_instructions,
      shipping_info: formData.shipping_info,
      materials: formData.materials,
      dimensions: formData.dimensions,
      burn_time: formData.burn_time,
      has_color_options: formData.has_color_options,
      has_flavor_options: formData.has_flavor_options,
      color_options: formData.has_color_options ? formData.color_options : [],
      flavor_options: formData.has_flavor_options ? formData.flavor_options : []
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
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </DialogTitle>
            </DialogHeader>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic" data-testid="tab-basic">Basic Info</TabsTrigger>
                <TabsTrigger value="variants" data-testid="tab-variants">Variants</TabsTrigger>
                <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
              </TabsList>
              
              <form onSubmit={handleSubmit}>
                {/* Basic Info Tab */}
                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="price">Price (₹) *</Label>
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                      <Label htmlFor="stock">Stock *</Label>
                      <Input
                        id="stock"
                        name="stock"
                        type="number"
                        value={formData.stock}
                        onChange={handleChange}
                        required
                        className="mt-1"
                        data-testid="product-stock-input"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="images">Image URLs (comma-separated)</Label>
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                </TabsContent>

                {/* Variants Tab */}
                <TabsContent value="variants" className="space-y-6 mt-4">
                  {/* Color Options */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Palette className="h-5 w-5 text-terracotta" strokeWidth={1.5} />
                        <Label className="text-base font-medium">Color Options</Label>
                      </div>
                      <Switch
                        checked={formData.has_color_options}
                        onCheckedChange={(checked) => setFormData({ ...formData, has_color_options: checked })}
                        data-testid="enable-color-options"
                      />
                    </div>
                    
                    {formData.has_color_options && (
                      <div className="space-y-4">
                        {/* Existing Colors */}
                        {formData.color_options.length > 0 && (
                          <div className="space-y-2">
                            {formData.color_options.map((color, index) => (
                              <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                                <div 
                                  className="w-8 h-8 rounded-full border-2 border-border"
                                  style={{ backgroundColor: color.hex_code }}
                                />
                                <div className="flex-1">
                                  <p className="font-medium">{color.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {color.images?.length || 0} images
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeColorOption(index)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Add New Color */}
                        <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                          <div>
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={newColor.name}
                              onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                              placeholder="e.g., Natural White"
                              className="mt-1"
                              data-testid="new-color-name"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Hex Code</Label>
                            <div className="flex gap-2 mt-1">
                              <Input
                                type="color"
                                value={newColor.hex_code}
                                onChange={(e) => setNewColor({ ...newColor, hex_code: e.target.value })}
                                className="w-12 h-9 p-1 cursor-pointer"
                              />
                              <Input
                                value={newColor.hex_code}
                                onChange={(e) => setNewColor({ ...newColor, hex_code: e.target.value })}
                                placeholder="#F5F0E8"
                                className="flex-1"
                                data-testid="new-color-hex"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Image URLs</Label>
                            <Input
                              value={newColor.images}
                              onChange={(e) => setNewColor({ ...newColor, images: e.target.value })}
                              placeholder="URL1, URL2"
                              className="mt-1"
                              data-testid="new-color-images"
                            />
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
                    )}
                  </div>

                  {/* Flavor Options */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Droplets className="h-5 w-5 text-terracotta" strokeWidth={1.5} />
                        <Label className="text-base font-medium">Fragrance Options</Label>
                      </div>
                      <Switch
                        checked={formData.has_flavor_options}
                        onCheckedChange={(checked) => setFormData({ ...formData, has_flavor_options: checked })}
                        data-testid="enable-flavor-options"
                      />
                    </div>
                    
                    {formData.has_flavor_options && (
                      <div className="space-y-4">
                        {/* Existing Flavors */}
                        {formData.flavor_options.length > 0 && (
                          <div className="space-y-2">
                            {formData.flavor_options.map((flavor, index) => (
                              <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                                <div className="w-8 h-8 rounded-full bg-terracotta/20 flex items-center justify-center">
                                  <Droplets className="h-4 w-4 text-terracotta" />
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium">{flavor.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {flavor.description || 'No description'}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFlavorOption(index)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Add New Flavor */}
                        <div className="grid grid-cols-3 gap-3 pt-3 border-t">
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
                          <div>
                            <Label className="text-xs">Image URLs</Label>
                            <Input
                              value={newFlavor.images}
                              onChange={(e) => setNewFlavor({ ...newFlavor, images: e.target.value })}
                              placeholder="URL1, URL2"
                              className="mt-1"
                              data-testid="new-flavor-images"
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
                    )}
                  </div>
                </TabsContent>

                {/* Details Tab */}
                <TabsContent value="details" className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="materials">Materials</Label>
                    <Input
                      id="materials"
                      name="materials"
                      value={formData.materials}
                      onChange={handleChange}
                      placeholder="e.g., 100% Natural Soy Wax, Cotton Wick"
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                      rows={3}
                      placeholder="How to care for this product..."
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
                      rows={3}
                      placeholder="Shipping details and timelines..."
                      className="mt-1"
                    />
                  </div>
                </TabsContent>

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
              <TableHead>Stock</TableHead>
              <TableHead>Variants</TableHead>
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
              filteredProducts.map((product) => (
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
                        {product.short_description && (
                          <span className="text-xs text-muted-foreground line-clamp-1">
                            {product.short_description}
                          </span>
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
                    <span className={product.stock <= 5 ? 'text-destructive' : ''}>
                      {product.stock}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {product.has_color_options && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Palette className="h-3 w-3" /> {product.color_options?.length || 0}
                        </span>
                      )}
                      {product.has_flavor_options && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Droplets className="h-3 w-3" /> {product.flavor_options?.length || 0}
                        </span>
                      )}
                      {!product.has_color_options && !product.has_flavor_options && (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminProducts;
