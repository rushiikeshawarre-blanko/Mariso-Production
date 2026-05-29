import React, { useState, useEffect, useMemo, useRef } from 'react';
import Cropper from 'react-easy-crop';
import {
  getAdminProducts,
  getAdminCategories,
  createProduct,
  updateProduct,
  updateProductShopOrder,
  deleteProduct,
  createPresignedUpload,
  uploadFileToPresignedUrl,
  clearPublicCatalogCache,
} from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import RichTextEditor from '../../components/ui/rich-text-editor';
import { normalizeEditorHtml } from '../../lib/richContent';
import { getFirstImageUrl, getThumbImage, normalizeImageUrl } from '../../lib/utils';
import { Plus, Pencil, Trash2, Search, Palette, Droplets, X, Image, ChevronLeft, ChevronRight, Package, RefreshCw, Check, ArrowUp, ArrowDown, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';


const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const hasImageUrl = (image) => Boolean(normalizeImageUrl(image));

const PRODUCT_IMAGE_VARIANTS = [
  { key: 'thumb', width: 300, height: 400, quality: 0.78 },
  { key: 'card', width: 600, height: 800, quality: 0.78 },
  { key: 'detail', width: 1200, height: 1600, quality: 0.84 },
];

const SHOP_PRIORITY_OPTIONS = [
  { value: '0', label: 'Normal' },
  { value: '30', label: 'New Arrival' },
  { value: '50', label: 'Promote / Show Higher' },
  { value: '100', label: 'Show First / Festive' },
];

const SHOP_ORDER_GROUPS = [
  { value: '100', label: 'Show First / Festive' },
  { value: '50', label: 'Promote / Show Higher' },
  { value: '30', label: 'New Arrival' },
];

const getShopPrioritySelectValue = (priority) => {
  const numericPriority = Number(priority) || 0;
  if (numericPriority >= 100) return '100';
  if (numericPriority >= 50) return '50';
  if (numericPriority >= 30) return '30';
  return '0';
};

const sortProductsForShopOrder = (items) => (
  [...items].sort((a, b) => (
    (Number(a.shop_order) || 0) - (Number(b.shop_order) || 0) ||
    new Date(b.created_at || 0) - new Date(a.created_at || 0) ||
    (a.name || '').localeCompare(b.name || '')
  ))
);

const newGiftPackagingOption = (source = {}) => ({
  id: source.id || '',
  title: source.title || source.gift_packaging_title || 'Add Gift Packaging',
  description: source.description || source.gift_packaging_description || 'Premium gift wrap with ribbon and a custom note card',
  price: String(source.price ?? source.gift_packaging_price ?? 149),
  message_enabled: source.message_enabled ?? source.gift_message_enabled ?? true,
  is_active: source.is_active !== false,
  sort_order: String(source.sort_order ?? 0),
});

const getEditableGiftOptions = (product = {}) => (
  Array.isArray(product.gift_packaging_options) && product.gift_packaging_options.length > 0
    ? product.gift_packaging_options.map((option) => newGiftPackagingOption(option))
    : [newGiftPackagingOption(product)]
);

const newPackOption = (source = {}, basePiecesPerUnit = 1) => {
  const multiplier = Math.max(Number(source.multiplier ?? source.pack_quantity ?? 1) || 1, 1);
  const label = source.label || (multiplier === 1 ? 'Single' : `Pack of ${multiplier}`);
  return {
    id: source.id || '',
    label,
    multiplier: String(multiplier),
    pack_quantity: String(multiplier),
    pieces_per_pack: Math.max(Number(basePiecesPerUnit) || 1, 1) * multiplier,
    is_active: source.is_active !== false,
    image: source.image || null,
    images: source.images || [],
  };
};

const getProductFormSnapshot = ({ formData, newColor, newFlavor, slugManuallyEdited }) => JSON.stringify({
  formData,
  newColor,
  newFlavor,
  slugManuallyEdited,
});

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatApiErrorDetail = (detail) => {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return String(item);

        const loc = Array.isArray(item.loc) ? item.loc.join('.') : item.loc;
        const message = item.msg || item.message || safeStringify(item);

        return loc ? `${loc}: ${message}` : message;
      })
      .join('; ');
  }

  if (typeof detail === 'object') {
    return detail.msg || detail.message || safeStringify(detail);
  }

  return String(detail);
};

const getApiErrorMessage = (error, fallback) => {
  const responseData = error?.response?.data;
  const detail = responseData?.detail ?? responseData?.message ?? responseData?.error ?? responseData;
  const message = formatApiErrorDetail(detail);
  return message || error?.message || fallback;
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shopOrderOpen, setShopOrderOpen] = useState(false);
  const [shopOrderGroups, setShopOrderGroups] = useState({});
  const [savingShopOrder, setSavingShopOrder] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState('basic');
  const [generating, setGenerating] = useState(false);
  const [editingColorIndex, setEditingColorIndex] = useState(null);
  const [editingFlavorIndex, setEditingFlavorIndex] = useState(null);
  const [uploadingDefaultImage, setUploadingDefaultImage] = useState(false);
  const [isDraggingDefaultImage, setIsDraggingDefaultImage] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [pendingDefaultImageFile, setPendingDefaultImageFile] = useState(null);
  const [pendingDefaultImageUrl, setPendingDefaultImageUrl] = useState('');
  const [pendingDefaultImageIndex, setPendingDefaultImageIndex] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [uploadingColorImage, setUploadingColorImage] = useState(false);
  const [colorCropModalOpen, setColorCropModalOpen] = useState(false);
  const [pendingColorImageFile, setPendingColorImageFile] = useState(null);
  const [pendingColorImageUrl, setPendingColorImageUrl] = useState('');
  const [pendingColorImageMeta, setPendingColorImageMeta] = useState({ colorIndex: null, imageIndex: null });
  const [colorCrop, setColorCrop] = useState({ x: 0, y: 0 });
  const [colorZoom, setColorZoom] = useState(1);
  const [colorCroppedAreaPixels, setColorCroppedAreaPixels] = useState(null);
  const [newColorCropModalOpen, setNewColorCropModalOpen] = useState(false);
  const [pendingNewColorImageFile, setPendingNewColorImageFile] = useState(null);
  const [pendingNewColorImageUrl, setPendingNewColorImageUrl] = useState('');
  const [pendingNewColorImageIndex, setPendingNewColorImageIndex] = useState(null);
  const [newColorCrop, setNewColorCrop] = useState({ x: 0, y: 0 });
  const [newColorZoom, setNewColorZoom] = useState(1);
  const [newColorCroppedAreaPixels, setNewColorCroppedAreaPixels] = useState(null);
  const [draggingNewColorImageIndex, setDraggingNewColorImageIndex] = useState(null);
  const [uploadingProductVideo, setUploadingProductVideo] = useState(false);
  const [uploadingNewColorVideo, setUploadingNewColorVideo] = useState(false);
  const [uploadingColorVideoIndex, setUploadingColorVideoIndex] = useState(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [discardProductChangesOpen, setDiscardProductChangesOpen] = useState(false);

  const colorCropSectionRef = useRef(null);
  const newColorCropSectionRef = useRef(null);
  const initialProductFormSnapshotRef = useRef(null);
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    short_description: '',
    price: '',
    discount_price: '',
    category_id: '',
    sku: '',
    stock: '',
    sell_as_pack: false,
    pack_size: '1',
    pack_label: '',
    base_pieces_per_unit: '1',
    pack_options: [],
    shop_priority: '0',
    images: [],
    video: '',
    is_on_sale: false,
    is_featured: false,
    is_bestseller: false,
    is_new_arrival: false,
    is_active: true,
    show_free_shipping: true,
    show_returns: true,
    show_reusable_container: true,
    show_gift_packaging: true,
    gift_packaging_title: 'Add Gift Packaging',
    gift_packaging_description: 'Premium gift wrap with ribbon and a custom note card',
    gift_packaging_price: '149',
    gift_message_enabled: true,
    gift_packaging_options: [newGiftPackagingOption()],
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
  const [newColor, setNewColor] = useState({ 
    name: '',
    hex_code: '#F5F0E8',
    hex_code_secondary: '',
    images: ['', '', '', '', ''],
    video: ''
   })
  const [newFlavor, setNewFlavor] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [prods, cats] = await Promise.all([
        getAdminProducts(),
        getAdminCategories()
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildShopOrderGroups = (productList) => (
    SHOP_ORDER_GROUPS.reduce((groups, group) => {
      groups[group.value] = sortProductsForShopOrder(
        (productList || []).filter((product) => getShopPrioritySelectValue(product.shop_priority) === group.value)
      );
      return groups;
    }, {})
  );

  const openShopOrderDialog = () => {
    setShopOrderGroups(buildShopOrderGroups(products));
    setShopOrderOpen(true);
  };

  const moveShopOrderProduct = (groupValue, productIndex, direction) => {
    setShopOrderGroups((current) => {
      const groupProducts = [...(current[groupValue] || [])];
      const targetIndex = direction === 'up' ? productIndex - 1 : productIndex + 1;

      if (targetIndex < 0 || targetIndex >= groupProducts.length) {
        return current;
      }

      [groupProducts[productIndex], groupProducts[targetIndex]] = [
        groupProducts[targetIndex],
        groupProducts[productIndex],
      ];

      return {
        ...current,
        [groupValue]: groupProducts,
      };
    });
  };

  const handleSaveShopOrder = async () => {
    const items = SHOP_ORDER_GROUPS.flatMap((group) => (
      (shopOrderGroups[group.value] || []).map((product, productIndex) => ({
        product_id: product.id,
        shop_order: productIndex + 1,
      }))
    ));

    try {
      setSavingShopOrder(true);
      await updateProductShopOrder(items);
      toast.success('Shop order saved');
      clearPublicCatalogCache('products');
      setShopOrderOpen(false);
      await fetchData();
    } catch (error) {
      console.error('Error saving shop order:', error);
      const message = getApiErrorMessage(error, 'Failed to save shop order');
      toast.error(message);
    } finally {
      setSavingShopOrder(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'slug') {
      setSlugManuallyEdited(true);
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'name' && !slugManuallyEdited ? { slug: slugify(value) } : {}),
    }));
  };

  const handleImagesTextChange = (e) => {
    const rawValue = e.target.value || '';
    const normalizedImages = rawValue
      .split(/\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);

    setFormData({
      ...formData,
      images: normalizedImages,
    });
  };

  const createImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new window.Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const canvasToBlob = (canvas, fileType, quality) =>
    new Promise((resolve) => {
      canvas.toBlob(resolve, fileType, quality);
    });

  const getCroppedImageVariantFiles = async (imageSrc, cropPixels, originalFilename) => {
    const image = await createImage(imageSrc);
    const canvases = PRODUCT_IMAGE_VARIANTS.map((variant) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to create image canvas context');
      }

      canvas.width = variant.width;
      canvas.height = variant.height;
      context.drawImage(
        image,
        cropPixels.x,
        cropPixels.y,
        cropPixels.width,
        cropPixels.height,
        0,
        0,
        variant.width,
        variant.height
      );

      return canvas;
    });

    let fileType = 'image/webp';
    let blobs = await Promise.all(
      canvases.map((canvas, index) => canvasToBlob(canvas, fileType, PRODUCT_IMAGE_VARIANTS[index].quality))
    );

    if (blobs.some((blob) => !blob || blob.type !== fileType)) {
      fileType = 'image/jpeg';
      blobs = await Promise.all(
        canvases.map((canvas, index) => canvasToBlob(canvas, fileType, PRODUCT_IMAGE_VARIANTS[index].quality))
      );
    }

    if (blobs.some((blob) => !blob)) {
      throw new Error('Failed to create optimized image variants');
    }

    const extension = fileType === 'image/webp' ? 'webp' : 'jpg';
    const filenameBase = String(originalFilename || 'product-image').replace(/\.[^.]+$/, '');

    return PRODUCT_IMAGE_VARIANTS.map((variant, index) => new File(
      [blobs[index]],
      `${filenameBase}-${variant.key}.${extension}`,
      { type: fileType }
    ));
  };

  const uploadImageVariants = async (imageSrc, cropPixels, originalFilename, folder) => {
    const variantFiles = await getCroppedImageVariantFiles(imageSrc, cropPixels, originalFilename);
    const uploadedUrls = await Promise.all(
      variantFiles.map(async (file) => {
        const presigned = await createPresignedUpload({
          filename: file.name,
          content_type: file.type,
          folder,
        });

        await uploadFileToPresignedUrl(
          presigned.upload_url,
          file,
          presigned.content_type,
          presigned.cache_control
        );

        return presigned.file_url;
      })
    );

    const [thumbUrl, cardUrl, detailUrl] = uploadedUrls;
    return {
      url: detailUrl,
      thumb_url: thumbUrl,
      card_url: cardUrl,
      detail_url: detailUrl,
    };
  };

  const closeDefaultImageCropModal = () => {
    if (pendingDefaultImageUrl && pendingDefaultImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pendingDefaultImageUrl);
      }

    setCropModalOpen(false);
    setPendingDefaultImageFile(null);
    setPendingDefaultImageUrl('');
    setPendingDefaultImageIndex(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const openDefaultImageCropper = (file, imageIndex = null) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, WEBP, or GIF image');
      return;
    }

    const maxSizeBytes = 30 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error('Image size must be 30MB or less');
      return;
    }

    if (pendingDefaultImageUrl) {
      URL.revokeObjectURL(pendingDefaultImageUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingDefaultImageFile(file);
    setPendingDefaultImageUrl(previewUrl);
    setPendingDefaultImageIndex(imageIndex);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropModalOpen(true);
  };

  const onCropComplete = (_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  };

  const buildPlaceholderImageFile = (fallbackName, imageUrl) => {
  const sanitizedName = fallbackName || 'image';
  const urlWithoutQuery = (imageUrl || '').split('?')[0];
  const extensionMatch = urlWithoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1]?.toLowerCase();

  let mimeType = 'image/jpeg';
  if (extension === 'png') mimeType = 'image/png';
  if (extension === 'webp') mimeType = 'image/webp';
  if (extension === 'gif') mimeType = 'image/gif';

  const hasExtension = /\.[a-zA-Z0-9]+$/.test(sanitizedName);
  const filename = hasExtension ? sanitizedName : `${sanitizedName}.${extension || 'jpg'}`;

  return new File([], filename, { type: mimeType });
};

const openDefaultImageRecropper = (imageUrl, index) => {
  if (!imageUrl) return;

  if (pendingDefaultImageUrl && pendingDefaultImageUrl.startsWith('blob:')) {
    URL.revokeObjectURL(pendingDefaultImageUrl);
  }

  setPendingDefaultImageFile(buildPlaceholderImageFile(`product-image-${index + 1}`, imageUrl));
  setPendingDefaultImageUrl(imageUrl);
  setPendingDefaultImageIndex(index);
  setCrop({ x: 0, y: 0 });
  setZoom(1);
  setCroppedAreaPixels(null);
  setCropModalOpen(true);
};

const openExistingColorImageRecropper = (imageUrl, colorIndex, imageIndex) => {
  if (!imageUrl) return;

  if (pendingColorImageUrl && pendingColorImageUrl.startsWith('blob:')) {
    URL.revokeObjectURL(pendingColorImageUrl);
  }

  setPendingColorImageFile(
    buildPlaceholderImageFile(`color-${colorIndex + 1}-image-${imageIndex + 1}`, imageUrl)
  );
  setPendingColorImageUrl(imageUrl);
  setPendingColorImageMeta({ colorIndex, imageIndex });
  setColorCrop({ x: 0, y: 0 });
  setColorZoom(1);
  setColorCroppedAreaPixels(null);
  setColorCropModalOpen(true);
  setTimeout(() => {
    colorCropSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
};

const openNewColorImageRecropper = (imageUrl, imageIndex) => {
  if (!imageUrl) return;

  if (pendingNewColorImageUrl && pendingNewColorImageUrl.startsWith('blob:')) {
    URL.revokeObjectURL(pendingNewColorImageUrl);
  }

  setPendingNewColorImageFile(buildPlaceholderImageFile(`new-color-image-${imageIndex + 1}`, imageUrl));
  setPendingNewColorImageUrl(imageUrl);
  setPendingNewColorImageIndex(imageIndex);
  setNewColorCrop({ x: 0, y: 0 });
  setNewColorZoom(1);
  setNewColorCroppedAreaPixels(null);
  setNewColorCropModalOpen(true);
  setTimeout(() => {
    newColorCropSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
};


  const handleDefaultImageRecrop = async (imageUrl, index) => {
  try {
    openDefaultImageRecropper(imageUrl, index);
  } catch (error) {
    console.error('Error preparing default image for re-crop:', error);
    toast.error('Failed to open image for re-crop');
  }
};

  const handleExistingColorImageRecrop = async (imageUrl, colorIndex, imageIndex) => {
  try {
    openExistingColorImageRecropper(imageUrl, colorIndex, imageIndex);
  } catch (error) {
    console.error('Error preparing color image for re-crop:', error);
    toast.error('Failed to open color image for re-crop');
  }
};

  const handleNewColorImageRecrop = async (imageUrl, imageIndex) => {
  try {
    openNewColorImageRecropper(imageUrl, imageIndex);
  } catch (error) {
    console.error('Error preparing new color image for re-crop:', error);
    toast.error('Failed to open image for re-crop');
  }
};

  const handleCropAndUpload = async () => {
    if (!pendingDefaultImageFile || !pendingDefaultImageUrl || !croppedAreaPixels) {
      toast.error('Please adjust the crop before uploading');
      return;
    }

    try {
      const uploaded = await uploadDefaultImageFile(
        pendingDefaultImageUrl,
        croppedAreaPixels,
        pendingDefaultImageFile.name,
        pendingDefaultImageIndex
      );

      if (uploaded) {
        closeDefaultImageCropModal();
      }
    } catch (error) {
      console.error('Error cropping default image:', error);
      toast.error('Failed to crop and upload image');
    }
  };

  const closeColorImageCropModal = () => {
    if (pendingColorImageUrl && pendingColorImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pendingColorImageUrl);
    }

    setColorCropModalOpen(false);
    setPendingColorImageFile(null);
    setPendingColorImageUrl('');
    setPendingColorImageMeta({ colorIndex: null, imageIndex: null });
    setColorCrop({ x: 0, y: 0 });
    setColorZoom(1);
    setColorCroppedAreaPixels(null);
  };

  const openColorImageCropper = (file, colorIndex, imageIndex) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, WEBP, or GIF image');
      return;
    }

    const maxSizeBytes = 30 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error('Image size must be 30MB or less');
      return;
    }

    if (pendingColorImageUrl) {
      URL.revokeObjectURL(pendingColorImageUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingColorImageFile(file);
    setPendingColorImageUrl(previewUrl);
    setPendingColorImageMeta({ colorIndex, imageIndex });
    setColorCrop({ x: 0, y: 0 });
    setColorZoom(1);
    setColorCroppedAreaPixels(null);
    setColorCropModalOpen(true);
    setTimeout(() => {
      colorCropSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const onColorCropComplete = (_, croppedPixels) => {
    setColorCroppedAreaPixels(croppedPixels);
  };

  const uploadColorImageFile = async (imageSrc, cropPixels, originalFilename, colorIndex, imageIndex) => {
    try {
      setUploadingColorImage(true);

      const image = await uploadImageVariants(
        imageSrc,
        cropPixels,
        originalFilename,
        'products/colors'
      );

      updateColorImage(colorIndex, imageIndex, image);
      toast.success('Color image uploaded successfully');
      return true;
    } catch (error) {
      console.error('Error uploading color image:', error);
      toast.error('Failed to upload color image');
      return false;
    } finally {
      setUploadingColorImage(false);
    }
  };

  const handleColorCropAndUpload = async () => {
    const { colorIndex, imageIndex } = pendingColorImageMeta;

    if (
      !pendingColorImageFile ||
      !pendingColorImageUrl ||
      !colorCroppedAreaPixels ||
      colorIndex === null ||
      imageIndex === null
    ) {
      toast.error('Please adjust the crop before uploading');
      return;
    }

    try {
      const uploaded = await uploadColorImageFile(
        pendingColorImageUrl,
        colorCroppedAreaPixels,
        pendingColorImageFile.name,
        colorIndex,
        imageIndex
      );

      if (uploaded) {
        closeColorImageCropModal();
      }
    } catch (error) {
      console.error('Error cropping color image:', error);
      toast.error('Failed to crop and upload color image');
    }
  };

  const handleColorImageUpload = (e, colorIndex, imageIndex) => {
    const file = e.target.files?.[0];
    if (!file) return;

    openColorImageCropper(file, colorIndex, imageIndex);
    e.target.value = '';
  };

  const uploadNewColorImageFile = async (imageSrc, cropPixels, originalFilename, imageIndex) => {
    try {
      setUploadingColorImage(true);

      const image = await uploadImageVariants(
        imageSrc,
        cropPixels,
        originalFilename,
        'products/colors'
      );

      const nextImages = [...newColor.images];
      while (nextImages.length < 5) {
        nextImages.push('');
      }
      nextImages[imageIndex] = image;

      setNewColor((prev) => ({
        ...prev,
        images: nextImages,
      }));

      toast.success('New color image uploaded successfully');
      return true;
    } catch (error) {
      console.error('Error uploading new color image:', error);
      toast.error('Failed to upload new color image');
      return false;
    } finally {
      setUploadingColorImage(false);
    }
  };

  const handleNewColorImageUpload = (e, imageIndex) => {
    const file = e.target.files?.[0];
    if (!file) return;

    openNewColorImageCropper(file, imageIndex);
    e.target.value = '';
  };

  const closeNewColorImageCropModal = () => {
    if (pendingNewColorImageUrl && pendingNewColorImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pendingNewColorImageUrl);
    }

    setNewColorCropModalOpen(false);
    setPendingNewColorImageFile(null);
    setPendingNewColorImageUrl('');
    setPendingNewColorImageIndex(null);
    setNewColorCrop({ x: 0, y: 0 });
    setNewColorZoom(1);
    setNewColorCroppedAreaPixels(null);
  };

  const openNewColorImageCropper = (file, imageIndex) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, WEBP, or GIF image');
      return;
    }

    const maxSizeBytes = 30 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error('Image size must be 30MB or less');
      return;
    }

    if (pendingNewColorImageUrl) {
      URL.revokeObjectURL(pendingNewColorImageUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingNewColorImageFile(file);
    setPendingNewColorImageUrl(previewUrl);
    setPendingNewColorImageIndex(imageIndex);
    setNewColorCrop({ x: 0, y: 0 });
    setNewColorZoom(1);
    setNewColorCroppedAreaPixels(null);
    setNewColorCropModalOpen(true);
    setTimeout(() => {
      newColorCropSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const onNewColorCropComplete = (_, croppedPixels) => {
    setNewColorCroppedAreaPixels(croppedPixels);
  };

  const handleNewColorCropAndUpload = async () => {
    if (
      !pendingNewColorImageFile ||
      !pendingNewColorImageUrl ||
      !newColorCroppedAreaPixels ||
      pendingNewColorImageIndex === null
    ) {
      toast.error('Please adjust the crop before uploading');
      return;
    }

    try {
      const uploaded = await uploadNewColorImageFile(
        pendingNewColorImageUrl,
        newColorCroppedAreaPixels,
        pendingNewColorImageFile.name,
        pendingNewColorImageIndex
      );

      if (uploaded) {
        closeNewColorImageCropModal();
      }
    } catch (error) {
      console.error('Error cropping new color image:', error);
      toast.error('Failed to crop and upload new color image');
    }
  };

  const handleNewColorImageDragOver = (e, imageIndex) => {
    e.preventDefault();
    e.stopPropagation();

    if (!uploadingColorImage) {
      setDraggingNewColorImageIndex(imageIndex);
    }
  };

  const handleNewColorImageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingNewColorImageIndex(null);
  };

  const handleNewColorImageDrop = (e, imageIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingNewColorImageIndex(null);

    if (uploadingColorImage) return;

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    openNewColorImageCropper(file, imageIndex);
  };

  const moveNewColorImage = (fromIndex, toIndex) => {
    setNewColor((prev) => {
      const nextImages = [...(prev.images || [])];

      while (nextImages.length < 5) {
        nextImages.push('');
      }

      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= nextImages.length ||
        toIndex >= nextImages.length ||
        !nextImages[fromIndex]
      ) {
        return prev;
      }

      [nextImages[fromIndex], nextImages[toIndex]] = [
        nextImages[toIndex],
        nextImages[fromIndex],
      ];

      return {
        ...prev,
        images: nextImages,
      };
    });
  };

  const uploadDefaultImageFile = async (imageSrc, cropPixels, originalFilename, replaceIndex = null) => {
    try {
      setUploadingDefaultImage(true);

      const image = await uploadImageVariants(
        imageSrc,
        cropPixels,
        originalFilename,
        'products/default'
      );

      setFormData((prev) => {
        const currentImages = [...(prev.images || [])].filter(Boolean);

        if (typeof replaceIndex === 'number') {
          const nextImages = [...currentImages];
          nextImages[replaceIndex] = image;

          return {
            ...prev,
            images: nextImages.slice(0, 5),
          };
        }

        if (currentImages.length >= 5) {
          toast.error('You can upload up to 5 product images only');
          return prev;
        }

        return {
          ...prev,
          images: [...currentImages, image].slice(0, 5),
        };
      });  

      toast.success('Image uploaded successfully');
      return true;
    } catch (error) {
      console.error('Error uploading default image:', error);
      toast.error('Failed to upload image');
      return false;
    } finally {
      setUploadingDefaultImage(false);
    }
  };

  const handleDefaultImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    openDefaultImageCropper(file);
    e.target.value = '';
  };

  const handleDefaultImageReplace = (e, index) => {
    const file = e.target.files?.[0];
    if (!file) return;

    openDefaultImageCropper(file, index);
    e.target.value = '';
  };

  const handleDefaultImageDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!uploadingDefaultImage) {
      setIsDraggingDefaultImage(true);
    }
  };

  const handleDefaultImageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDefaultImage(false);
  };

  const handleDefaultImageDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDefaultImage(false);

    if (uploadingDefaultImage) return;

    const currentImageCount = (formData.images || []).filter(Boolean).length;
    if (currentImageCount >= 5) {
      toast.error('You can upload up to 5 product images only');
      return;
    }

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    openDefaultImageCropper(file);
  };

  const removeDefaultImage = (indexToRemove) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, index) => index !== indexToRemove),
    }));
  };

  const moveDefaultImage = (fromIndex, toIndex) => {
    setFormData((prev) => {
      const nextImages = [...(prev.images || [])];

      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= nextImages.length ||
        toIndex >= nextImages.length ||
        !nextImages[fromIndex]
      ) {
        return prev;
      }

      [nextImages[fromIndex], nextImages[toIndex]] = [
        nextImages[toIndex],
        nextImages[fromIndex],
      ];

      return {
        ...prev,
        images: nextImages,
      };
    });
  };

  const uploadProductVideoFile = async (file) => {
    if (!file) return;

    const allowedTypes = ['video/mp4'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload an MP4 video');
      return;
    }

    const maxSizeBytes = 100 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error('Video size must be 100MB or less');
      return;
    }

    try {
      setUploadingProductVideo(true);

      const presigned = await createPresignedUpload({
        filename: file.name,
        content_type: file.type,
        folder: 'products/videos',
      });

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        file,
        presigned.content_type,
        presigned.cache_control
      );

      setFormData((prev) => ({
        ...prev,
        video: presigned.file_url,
      }));

      toast.success('Video uploaded successfully');
    } catch (error) {
      console.error('Error uploading product video:', error);
      toast.error('Failed to upload video');
    } finally {
      setUploadingProductVideo(false);
    }
  };

  const handleProductVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadProductVideoFile(file);
    e.target.value = '';
  };

  const removeProductVideo = () => {
    setFormData((prev) => ({
      ...prev,
      video: '',
    }));
  };

  const uploadColorVideoFile = async (file, colorIndex) => {
    if (!file) return;

    if (file.type !== 'video/mp4') {
      toast.error('Please upload an MP4 video');
      return;
    }

    const maxSizeBytes = 100 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error('Video size must be 100MB or less');
      return;
    }

    try {
      setUploadingColorVideoIndex(colorIndex);

      const presigned = await createPresignedUpload({
        filename: file.name,
        content_type: file.type,
        folder: 'products/videos',
      });

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        file,
        presigned.content_type,
        presigned.cache_control
      );

      updateColorOption(colorIndex, 'video', presigned.file_url);
      toast.success('Color video uploaded successfully');
    } catch (error) {
      console.error('Error uploading color video:', error);
      toast.error('Failed to upload color video');
    } finally {
      setUploadingColorVideoIndex(null);
    }
  };

  const handleColorVideoUpload = async (e, colorIndex) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadColorVideoFile(file, colorIndex);
    e.target.value = '';
  };

  const removeColorVideo = (colorIndex) => {
    updateColorOption(colorIndex, 'video', '');
  };

  const uploadNewColorVideoFile = async (file) => {
    if (!file) return;

    if (file.type !== 'video/mp4') {
      toast.error('Please upload an MP4 video');
      return;
    }

    const maxSizeBytes = 100 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error('Video size must be 100MB or less');
      return;
    }

    try {
      setUploadingNewColorVideo(true);

      const presigned = await createPresignedUpload({
        filename: file.name,
        content_type: file.type,
        folder: 'products/videos',
      });

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        file,
        presigned.content_type,
        presigned.cache_control
      );

      setNewColor((prev) => ({
        ...prev,
        video: presigned.file_url,
      }));

      toast.success('New color video uploaded successfully');
    } catch (error) {
      console.error('Error uploading new color video:', error);
      toast.error('Failed to upload new color video');
    } finally {
      setUploadingNewColorVideo(false);
    }
  };

  const handleNewColorVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadNewColorVideoFile(file);
    e.target.value = '';
  };

  const removeNewColorVideo = () => {
    setNewColor((prev) => ({
      ...prev,
      video: '',
    }));
  };

  const getCurrentProductFormSnapshot = () => getProductFormSnapshot({
    formData,
    newColor,
    newFlavor,
    slugManuallyEdited,
  });

  const hasProductFormChanged = () => (
    Boolean(initialProductFormSnapshotRef.current) &&
    initialProductFormSnapshotRef.current !== getCurrentProductFormSnapshot()
  );

  const captureProductFormSnapshot = (nextFormData, nextNewColor, nextNewFlavor, nextSlugManuallyEdited) => {
    initialProductFormSnapshotRef.current = getProductFormSnapshot({
      formData: nextFormData,
      newColor: nextNewColor,
      newFlavor: nextNewFlavor,
      slugManuallyEdited: nextSlugManuallyEdited,
    });
  };

  const getDefaultFormData = () => ({
      name: '',
      slug: '',
      description: '',
      short_description: '',
      price: '',
      discount_price: '',
      category_id: '',
      sku: '',
      stock: '',
      sell_as_pack: false,
      pack_size: '1',
      pack_label: '',
      base_pieces_per_unit: '1',
      pack_options: [],
      shop_priority: '0',
      images: [],
      video: '',
      is_on_sale: false,
      is_featured: false,
      is_bestseller: false,
      is_new_arrival: false,
      is_active: true,
      show_free_shipping: true,
      show_returns: true,
      show_reusable_container: true,
      show_gift_packaging: true,
      gift_packaging_title: 'Add Gift Packaging',
      gift_packaging_description: 'Premium gift wrap with ribbon and a custom note card',
      gift_packaging_price: '149',
      gift_message_enabled: true,
      gift_packaging_options: [newGiftPackagingOption()],
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

  const getDefaultNewColor = () => ({
      name: '',
      hex_code: '#F5F0E8',
      hex_code_secondary: '',
      images: ['', '', '', '', ''],
      video: ''
  });

  const getDefaultNewFlavor = () => ({ name: '', description: '' });

  const resetForm = () => {
    setFormData(getDefaultFormData());
    setNewColor(getDefaultNewColor());
    setNewFlavor(getDefaultNewFlavor());
    setActiveTab('basic');
    setEditingColorIndex(null);
    setEditingFlavorIndex(null);
    setSlugManuallyEdited(false);
  };

  const closeProductModal = () => {
    setDialogOpen(false);
    setDiscardProductChangesOpen(false);
    initialProductFormSnapshotRef.current = null;
    setEditingProduct(null);
    resetForm();
  };

  const requestCloseProductModal = () => {
    if (hasProductFormChanged()) {
      setDiscardProductChangesOpen(true);
      return;
    }

    closeProductModal();
  };

  const handleProductDialogOpenChange = (open) => {
    if (open) {
      setDialogOpen(true);
      return;
    }

    requestCloseProductModal();
  };

  const handleProductDialogInteractOutside = (event) => {
    if (discardProductChangesOpen) {
      event.preventDefault();
      return;
    }

    if (!hasProductFormChanged()) return;

    event.preventDefault();
    requestCloseProductModal();
  };

  const handleProductDialogEscapeKeyDown = (event) => {
    if (discardProductChangesOpen) {
      event.preventDefault();
      continueEditingProduct();
      return;
    }

    handleProductDialogInteractOutside(event);
  };

  const continueEditingProduct = () => {
    setDiscardProductChangesOpen(false);
  };

  const openCreateDialog = () => {
    const nextFormData = getDefaultFormData();
    const nextNewColor = getDefaultNewColor();
    const nextNewFlavor = getDefaultNewFlavor();

    setEditingProduct(null);
    setFormData(nextFormData);
    setNewColor(nextNewColor);
    setNewFlavor(nextNewFlavor);
    setActiveTab('basic');
    setEditingColorIndex(null);
    setEditingFlavorIndex(null);
    setSlugManuallyEdited(false);
    setDiscardProductChangesOpen(false);
    captureProductFormSnapshot(nextFormData, nextNewColor, nextNewFlavor, false);
    setDialogOpen(true);
  };

  const openEditDialog = (product) => {
    const nextSlugManuallyEdited = Boolean(product.slug);
    const nextFormData = {
      name: product.name,
      slug: product.slug || '',
      description: product.description,
      short_description: product.short_description || '',
      price: product.price.toString(),
      discount_price: product.discount_price?.toString() || '',
      category_id: product.category_id,
      sku: product.sku || '',
      stock: product.stock.toString(),
      sell_as_pack: product.sell_as_pack === true,
      pack_size: String(product.pack_size || 1),
      pack_label: product.pack_label || '',
      base_pieces_per_unit: String(product.base_pieces_per_unit || 1),
      pack_options: (product.pack_options || []).map((option) => newPackOption(option, product.base_pieces_per_unit || 1)),
      shop_priority: getShopPrioritySelectValue(product.shop_priority),
      images: product.images || [],
      video: product.video || '',
      is_on_sale: product.is_on_sale || false,
      is_featured: product.is_featured || false,
      is_bestseller: product.is_bestseller || false,
      is_new_arrival: product.is_new_arrival || false,
      is_active: product.is_active !== false,
      show_free_shipping: product.show_free_shipping !== false,
      show_returns: product.show_returns !== false,
      show_reusable_container: product.show_reusable_container !== false,
      show_gift_packaging: product.show_gift_packaging !== false,
      gift_packaging_title: product.gift_packaging_title || 'Add Gift Packaging',
      gift_packaging_description: product.gift_packaging_description || 'Premium gift wrap with ribbon and a custom note card',
      gift_packaging_price: (product.gift_packaging_price ?? 149).toString(),
      gift_message_enabled: product.gift_message_enabled !== false,
      gift_packaging_options: getEditableGiftOptions(product),
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
    };
    const nextNewColor = getDefaultNewColor();
    const nextNewFlavor = getDefaultNewFlavor();

    setEditingProduct(product);
    setSlugManuallyEdited(nextSlugManuallyEdited);
    setFormData(nextFormData);
    setNewColor(nextNewColor);
    setNewFlavor(nextNewFlavor);
    setActiveTab('basic');
    setEditingColorIndex(null);
    setEditingFlavorIndex(null);
    setDiscardProductChangesOpen(false);
    captureProductFormSnapshot(nextFormData, nextNewColor, nextNewFlavor, nextSlugManuallyEdited);
    setDialogOpen(true);
  };

  // ==================== COLOR OPTIONS ====================
  const addColorOption = () => {
    if (!newColor.name.trim()) {
      toast.error('Color name is required');
      return;
    }
    const colorImages = newColor.images.filter(hasImageUrl);
    const newColorOption = {
      id: `temp-${Date.now()}`,
      name: newColor.name,
      hex_code: newColor.hex_code,
      hex_code_secondary: newColor.hex_code_secondary || null,
      images: colorImages,
      video: newColor.video || ''
    };
    setFormData({
      ...formData,
      color_options: [...formData.color_options, newColorOption]
    });
    setNewColor({
      name: '',
      hex_code: '#F5F0E8',
      hex_code_secondary: '',
      images: ['', '', '', '', ''],
      video: ''
     });
    setEditingColorIndex(null);
    toast.success('Color option added');
  };

  const removeColorOption = (index) => {
    const colorToRemove = formData.color_options[index];
    // Also remove variants that use this color
    const updatedVariants = formData.variants.filter(v => v.color_id !== colorToRemove.id);
    if (editingColorIndex === index) {
      setEditingColorIndex(null);
    } else if (editingColorIndex !== null && editingColorIndex > index) {
      setEditingColorIndex(editingColorIndex - 1);
    }
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

  const updateColorOption = (index, field, value) => {
    const updatedColors = [...formData.color_options];
    updatedColors[index] = { ...updatedColors[index], [field]: value };
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
    setEditingFlavorIndex(null);
    toast.success('Fragrance option added');
  };

  const removeFlavorOption = (index) => {
    const flavorToRemove = formData.flavor_options[index];
    // Also remove variants that use this flavor
    const updatedVariants = formData.variants.filter(v => v.flavor_id !== flavorToRemove.id);
    if (editingFlavorIndex === index) {
      setEditingFlavorIndex(null);
    } else if (editingFlavorIndex !== null && editingFlavorIndex > index) {
      setEditingFlavorIndex(editingFlavorIndex - 1);
    }
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

  // ==================== PACK OPTIONS ====================

  const getBasePiecesPerUnit = () => Math.max(parseInt(formData.base_pieces_per_unit, 10) || 1, 1);

  const addPackOption = () => {
    setFormData((current) => ({
      ...current,
      pack_options: [
        ...(current.pack_options || []),
        newPackOption({ multiplier: (current.pack_options || []).length === 0 ? 1 : 2 }, current.base_pieces_per_unit),
      ].map((option, index) => option.id ? option : { ...option, id: `temp-pack-${Date.now()}-${index}` }),
    }));
  };

  const updatePackOption = (index, field, value) => {
    setFormData((current) => {
      const basePieces = Math.max(parseInt(current.base_pieces_per_unit, 10) || 1, 1);
      const nextOptions = (current.pack_options || []).map((option, optionIndex) => {
        if (optionIndex !== index) return option;
        const updated = { ...option, [field]: value };
        if (field === 'multiplier') {
          const multiplier = Math.max(parseInt(value, 10) || 1, 1);
          updated.multiplier = String(multiplier);
          updated.pack_quantity = String(multiplier);
          updated.pieces_per_pack = basePieces * multiplier;
          if (!String(updated.label || '').trim()) {
            updated.label = multiplier === 1 ? 'Single' : `Pack of ${multiplier}`;
          }
        }
        return updated;
      });
      return { ...current, pack_options: nextOptions };
    });
  };

  const removePackOption = (index) => {
    const packToRemove = formData.pack_options[index];
    setFormData({
      ...formData,
      pack_options: formData.pack_options.filter((_, optionIndex) => optionIndex !== index),
      variants: formData.variants.filter((variant) => variant.pack_option_id !== packToRemove?.id),
    });
    toast.success('Pack option removed');
  };

  // ==================== VARIANT COMBINATIONS ====================

  const buildVariantCombinationsFromForm = () => {
    const existingVariantMap = new Map(
      formData.variants.map((variant) => [
        `${variant.color_id ?? 'null'}-${variant.flavor_id ?? 'null'}-${variant.pack_option_id ?? 'null'}`,
        variant,
      ])
    );

    const generatedVariants = [];
    const colors = formData.has_color_options ? (formData.color_options || []).filter((color) => color?.is_active !== false) : [];
    const flavors = formData.has_flavor_options ? (formData.flavor_options || []).filter((flavor) => flavor?.is_active !== false) : [];
    const packs = (formData.pack_options || []).filter((pack) => pack?.is_active !== false);
    const colorValues = colors.length > 0 ? colors : [null];
    const flavorValues = flavors.length > 0 ? flavors : [null];
    const packValues = packs.length > 0 ? packs : [null];

    if (colors.length === 0 && flavors.length === 0 && packs.length === 0) {
      return [];
    }

    for (const color of colorValues) {
      for (const flavor of flavorValues) {
        for (const pack of packValues) {
          const comboKey = `${color?.id ?? 'null'}-${flavor?.id ?? 'null'}-${pack?.id ?? 'null'}`;
          const existingVariant = existingVariantMap.get(comboKey);
          const multiplier = Math.max(parseInt(pack?.multiplier ?? pack?.pack_quantity, 10) || 1, 1);

          generatedVariants.push({
            id: existingVariant?.id || `temp-${Date.now()}-${generatedVariants.length}`,
            color_id: color?.id || null,
            color_name: color?.name || null,
            flavor_id: flavor?.id || null,
            flavor_name: flavor?.name || null,
            pack_option_id: pack?.id || null,
            pack_label: pack?.label || (pack ? (multiplier === 1 ? 'Single' : `Pack of ${multiplier}`) : null),
            pack_multiplier: pack ? multiplier : null,
            pieces_per_pack: pack?.pieces_per_pack ?? (pack ? getBasePiecesPerUnit() * multiplier : null),
            sku: existingVariant?.sku || '',
            price_override: existingVariant?.price_override ?? null,
            sale_price: existingVariant?.sale_price ?? null,
            stock: existingVariant?.stock ?? 0,
            is_active: existingVariant?.is_active ?? true,
          });
        }
      }
    }

    return generatedVariants;
  };

  const generateVariantCombinations = async () => {
    const generatedVariants = buildVariantCombinationsFromForm();

    setFormData((prev) => ({
      ...prev,
      variants: generatedVariants,
    }));

    toast.success(`Generated ${generatedVariants.length} variant combinations`);
  };

  const updateVariant = (index, field, value) => {
    const updatedVariants = [...formData.variants];
    if (field === 'stock') {
      updatedVariants[index] = { 
        ...updatedVariants[index], 
        stock: value === '' ? 0 : parseInt(value, 10) || 0,
      };
    } else if (field === 'price_override') {
      updatedVariants[index] = {
        ...updatedVariants[index],
        price_override: value === '' ? null : parseFloat(value)
      };
    } else if (field === 'sale_price') {
      updatedVariants[index] = {
        ...updatedVariants[index],
        sale_price: value === '' ? null : parseFloat(value)
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

  const addGiftPackagingOption = () => {
    setFormData((current) => ({
      ...current,
      gift_packaging_options: [
        ...current.gift_packaging_options,
        newGiftPackagingOption({ sort_order: current.gift_packaging_options.length }),
      ],
    }));
  };

  const updateGiftPackagingOption = (index, field, value) => {
    setFormData((current) => ({
      ...current,
      gift_packaging_options: current.gift_packaging_options.map((option, optionIndex) => (
        optionIndex === index ? { ...option, [field]: value } : option
      )),
    }));
  };

  const removeGiftPackagingOption = (index) => {
    setFormData((current) => ({
      ...current,
      gift_packaging_options: current.gift_packaging_options.filter((_, optionIndex) => optionIndex !== index),
    }));
  };

  // ==================== FORM SUBMISSION ====================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.is_on_sale) {
      if (!formData.discount_price) {
        toast.error('Sale price is required when On Sale is enabled');
        return;
      }
      if (parseFloat(formData.discount_price) >= parseFloat(formData.price)) {
        toast.error('Sale price must be less than base price');
        return;
      }
    }

    // Clean up color images (remove empty strings)
    const cleanedColorOptions = formData.color_options.map(color => ({
      ...color,
      images: (color.images || []).filter(hasImageUrl),
      video: color.video || ''
    }));
    const cleanedGiftOptions = formData.gift_packaging_options.map((option) => ({
      id: option.id || '',
      title: option.title.trim(),
      description: option.description.trim(),
      price: parseFloat(option.price) || 0,
      message_enabled: option.message_enabled,
      is_active: option.is_active,
      sort_order: parseInt(option.sort_order, 10) || 0,
    }));
    const legacyGiftOption = cleanedGiftOptions[0] || newGiftPackagingOption(formData);
    const basePiecesPerUnit = Math.max(parseInt(formData.base_pieces_per_unit, 10) || 1, 1);
    const cleanedPackOptions = (formData.pack_options || []).map((option) => {
      const multiplier = Math.max(parseInt(option.multiplier ?? option.pack_quantity, 10) || 1, 1);
      const label = String(option.label || '').trim() || (multiplier === 1 ? 'Single' : `Pack of ${multiplier}`);
      return {
        id: option.id || '',
        label,
        multiplier,
        pack_quantity: multiplier,
        pieces_per_pack: basePiecesPerUnit * multiplier,
        is_active: option.is_active !== false,
        image: option.image || null,
        images: (option.images || []).filter(hasImageUrl),
      };
    });
    
    const productData = {
      name: formData.name,
      slug: slugManuallyEdited ? formData.slug : '',
      description: normalizeEditorHtml(formData.description),
      short_description: formData.short_description,
      price: parseFloat(formData.price) || 0,
      discount_price: formData.is_on_sale && formData.discount_price ? parseFloat(formData.discount_price) : null,
      category_id: formData.category_id,
      sku: formData.sku,
      stock: parseInt(formData.stock, 10) || 0,
      sell_as_pack: false,
      pack_size: 1,
      pack_label: null,
      base_pieces_per_unit: basePiecesPerUnit,
      pack_options: cleanedPackOptions,
      shop_priority: parseInt(formData.shop_priority, 10) || 0,
      images: (formData.images || []).filter(hasImageUrl).slice(0, 5),
      video: formData.video,
      is_on_sale: formData.is_on_sale,
      is_featured: formData.is_featured,
      is_bestseller: formData.is_bestseller,
      is_new_arrival: formData.is_new_arrival,
      is_active: formData.is_active,
      show_free_shipping: formData.show_free_shipping,
      show_returns: formData.show_returns,
      show_reusable_container: formData.show_reusable_container,
      show_gift_packaging: formData.show_gift_packaging,
      gift_packaging_title: legacyGiftOption.title,
      gift_packaging_description: legacyGiftOption.description,
      gift_packaging_price: parseFloat(legacyGiftOption.price) || 0,
      gift_message_enabled: legacyGiftOption.message_enabled,
      gift_packaging_options: cleanedGiftOptions,
      care_instructions: normalizeEditorHtml(formData.care_instructions),
      shipping_info: normalizeEditorHtml(formData.shipping_info),
      materials: normalizeEditorHtml(formData.materials),
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
      clearPublicCatalogCache('products');
      closeProductModal();
      await fetchData();
    } catch (error) {
      console.error('Error saving product:', error);
      const message = getApiErrorMessage(error, 'Failed to save product');
      toast.error(message);
    }
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    
    try {
      await deleteProduct(productId);
      toast.success('Product deleted');
      clearPublicCatalogCache('products');
      await fetchData();
    } catch (error) {
      console.error('Error deleting product:', error);
      const message = getApiErrorMessage(error, 'Failed to delete product');
      toast.error(message);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalProducts = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
  const showingStart = totalProducts === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(endIndex, totalProducts);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const prioritizedProductCount = useMemo(
    () => products.filter((product) => Number(product.shop_priority) > 0).length,
    [products]
  );

  // Get variant count summary
  const getAvailableVariantSummary = (product) => {
    const variants = (product.variants || []).filter(v => v.is_active !== false);
    const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    return { count: variants.length, totalStock };
  };

  return (
    <div data-testid="admin-products">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-heading text-3xl">Products</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={openShopOrderDialog}
            data-testid="manage-shop-order-button"
          >
            <ListOrdered className="h-4 w-4 mr-2" strokeWidth={1.5} />
            Manage Shop Order
          </Button>
          <Dialog open={dialogOpen} onOpenChange={handleProductDialogOpenChange}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="btn-primary" data-testid="add-product-button">
              <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent
            className="w-[calc(100vw-1rem)] max-h-[85vh] max-w-none overflow-hidden p-0 sm:max-w-[900px]"
            onInteractOutside={handleProductDialogInteractOutside}
            onEscapeKeyDown={handleProductDialogEscapeKeyDown}
          >
            <div className="relative max-h-[85vh] overflow-hidden">
              <div className={`max-h-[85vh] p-4 sm:p-6 ${discardProductChangesOpen ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                <DialogHeader>
                  <DialogTitle className="font-heading text-xl">
                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                  </DialogTitle>
                  <DialogDescription>
                    Manage product details, variant options, pricing, and stock combinations.
                  </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                  <TabsList className="grid w-full grid-cols-2 gap-2 sm:grid-cols-5">
                    <TabsTrigger value="basic" data-testid="tab-basic">Basic Info</TabsTrigger>
                    <TabsTrigger value="colors" data-testid="tab-colors">
                      <Palette className="h-4 w-4 mr-1" /> Colors
                    </TabsTrigger>
                    <TabsTrigger value="fragrances" data-testid="tab-fragrances">
                      <Droplets className="h-4 w-4 mr-1" /> Fragrances
                    </TabsTrigger>
                    <TabsTrigger value="packs" data-testid="tab-packs">
                      <Package className="h-4 w-4 mr-1" /> Packs
                    </TabsTrigger>
                    <TabsTrigger value="variants" data-testid="tab-variants">
                      <Package className="h-4 w-4 mr-1" /> Stock
                    </TabsTrigger>
                  </TabsList>

                  <form onSubmit={handleSubmit}>
                  {/* ==================== BASIC INFO TAB ==================== */}
                  <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                      <Label htmlFor="slug">Slug</Label>
                      <Input
                        id="slug"
                        name="slug"
                        value={formData.slug}
                        onChange={handleChange}
                        placeholder="Auto-generated from name"
                        className="mt-1"
                        data-testid="product-slug-input"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used in product URL. Leave blank to auto-generate.
                      </p>
                    </div>
                    <div>
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
                    <div className="mt-1">
                      <RichTextEditor
                        value={formData.description}
                        onChange={(html) => setFormData((prev) => ({
                          ...prev,
                          description: html,
                        }))}
                        minHeightClassName="min-h-[180px]"
                        testId="product-description-input"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                    <div>
                      <Label htmlFor="price">Base Price (₹) *</Label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        min="0"
                        step="0.01"
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
                        min="0.01"
                        step="0.01"
                        value={formData.discount_price}
                        onChange={handleChange}
                        className="mt-1"
                        data-testid="product-sale-price-input"
                        disabled={!formData.is_on_sale}
                        placeholder={formData.is_on_sale ? 'Enter sale price' : 'Enable On Sale to enter sale price'}
                      />
                    </div>
                    <div>
                      <Label htmlFor="stock">Base Stock</Label>
                      <Input
                        id="stock"
                        name="stock"
                        type="number"
                        min="0"
                        step="1"
                        value={formData.stock}
                        onChange={handleChange}
                        className="mt-1"
                        placeholder="Used if no variants"
                        disabled={formData.variants.length > 0}
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
                  <div className="rounded-md border bg-muted/20 p-4">
                    <Label htmlFor="base_pieces_per_unit">Base pieces per unit</Label>
                    <Input
                      id="base_pieces_per_unit"
                      name="base_pieces_per_unit"
                      type="number"
                      min="1"
                      step="1"
                      value={formData.base_pieces_per_unit}
                      onChange={(event) => {
                        const value = event.target.value;
                        const basePieces = Math.max(parseInt(value, 10) || 1, 1);
                        setFormData((current) => ({
                          ...current,
                          base_pieces_per_unit: value,
                          pack_options: (current.pack_options || []).map((option) => {
                            const multiplier = Math.max(parseInt(option.multiplier ?? option.pack_quantity, 10) || 1, 1);
                            return { ...option, pieces_per_pack: basePieces * multiplier };
                          }),
                        }));
                      }}
                      className="mt-1 max-w-xs"
                      data-testid="product-base-pieces-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="shop_priority">Shop Visibility</Label>
                    <Select
                      value={formData.shop_priority || '0'}
                      onValueChange={(value) => setFormData({ ...formData, shop_priority: value })}
                    >
                      <SelectTrigger id="shop_priority" className="mt-1" data-testid="product-shop-priority-select">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {SHOP_PRIORITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Controls where this product appears on the Shop page. Use Show First / Festive for sale, festive, or campaign products.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label>Default Product Images</Label>
                        <p className="text-xs text-muted-foreground">
                          Upload up to 5 JPG, PNG, WEBP or GIF images, 30MB each. The first image is used as the primary image.
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formData.images.filter(Boolean).length}/5 images
                      </span>
                    </div>
                    {formData.has_color_options ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <p className="font-medium">Color Options are enabled</p>
                        <p className="mt-1 text-xs leading-relaxed">
                          Default product images and video will be used as fallback media. Upload color-specific images and videos in the Colors tab for the main customer gallery.
                        </p>
                      </div>
                    ) : null}

                    <div
                      className={`rounded-lg border border-dashed p-4 transition-colors ${
                        isDraggingDefaultImage
                          ? 'border-foreground bg-muted/50'
                          : 'border-border'
                      }`}
                      onDragOver={handleDefaultImageDragOver}
                      onDragLeave={handleDefaultImageDragLeave}
                      onDrop={handleDefaultImageDrop}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">Drag and drop product image here</p>
                          <p className="text-xs text-muted-foreground">
                            Or click a slot below to upload an image
                          </p>
                        </div>
                      </div>
                    </div>

                    {cropModalOpen && pendingDefaultImageUrl && (
                      <div className="space-y-4 rounded-xl border bg-background p-4 shadow-sm">
                        <div>
                          <h3 className="text-base font-semibold">Crop product image</h3>
                          <p className="text-sm text-muted-foreground">
                            Adjust the crop for a 3:4 product image before uploading.
                          </p>
                        </div>

                        <div className="relative h-[420px] overflow-hidden rounded-lg bg-black">
                          <Cropper
                            image={pendingDefaultImageUrl}
                            crop={crop}
                            zoom={zoom}
                            aspect={3 / 4}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                            showGrid={true}
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          <Label htmlFor="default-image-zoom" className="min-w-[48px] text-sm">
                            Zoom
                          </Label>
                          <input
                            id="default-image-zoom"
                            type="range"
                            min="1"
                            max="3"
                            step="0.1"
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full"
                          />
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={closeDefaultImageCropModal}
                            disabled={uploadingDefaultImage}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={handleCropAndUpload}
                            disabled={uploadingDefaultImage}
                          >
                            {uploadingDefaultImage ? 'Uploading...' : 'Crop & Upload'}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {Array.from({ length: 5 }).map((_, imageIndex) => {
                        const image = formData.images?.[imageIndex];
                        const imageUrl = getThumbImage(image);
                        const recropImageUrl = normalizeImageUrl(image);
                        const imageCount = formData.images.filter(Boolean).length;

                        return (
                          <div key={`default-image-${imageIndex}`} className="space-y-2 rounded-lg border p-2">
                            <div className="aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={`Product ${imageIndex + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-muted-foreground">
                                  <Image className="h-6 w-6 opacity-50" />
                                  <span>Image {imageIndex + 1}</span>
                                  <span>Up to 30MB</span>
                                </div>
                              )}
                            </div>

                            <label htmlFor={`default-image-upload-${imageIndex}`}>
                              <div className="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
                                {uploadingDefaultImage ? 'Uploading...' : imageUrl ? 'Replace' : 'Upload'}
                              </div>
                            </label>
                            <Input
                              id={`default-image-upload-${imageIndex}`}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              onChange={(e) => handleDefaultImageReplace(e, imageIndex)}
                              className="hidden"
                              disabled={uploadingDefaultImage}
                            />

                            {imageUrl ? (
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={uploadingDefaultImage || imageIndex === 0}
                                  onClick={() => moveDefaultImage(imageIndex, imageIndex - 1)}
                                  title="Move image left"
                                  aria-label={`Move product image ${imageIndex + 1} left`}
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={uploadingDefaultImage || imageIndex >= imageCount - 1}
                                  onClick={() => moveDefaultImage(imageIndex, imageIndex + 1)}
                                  title="Move image right"
                                  aria-label={`Move product image ${imageIndex + 1} right`}
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>                            
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="col-span-2"
                                  disabled={uploadingDefaultImage}
                                  onClick={() => handleDefaultImageRecrop(recropImageUrl, imageIndex)}
                                >
                                  Re-crop
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="col-span-2"
                                  onClick={() => removeDefaultImage(imageIndex)}
                                >
                                  Remove
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-3 border-t pt-4">
                    <Label htmlFor="product-video-upload">Product Video (MP4, optional)</Label>

                    <div className="rounded-lg border border-dashed p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">Upload one product video</p>
                          <p className="text-xs text-muted-foreground">
                            Recommended: 9:16 vertical MP4 video, up to 100MB
                          </p>
                        </div>

                        <label htmlFor="product-video-upload">
                          <div className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                            {uploadingProductVideo ? 'Uploading...' : formData.video ? 'Replace Video' : 'Choose Video'}
                          </div>
                        </label>

                        <Input
                          id="product-video-upload"
                          type="file"
                          accept="video/mp4"
                          onChange={handleProductVideoUpload}
                          className="hidden"
                          disabled={uploadingProductVideo}
                        />
                      </div>
                    </div>

                    {formData.video ? (
                      <div className="space-y-3 rounded-lg border p-3">
                        <div className="overflow-hidden rounded-lg border bg-black">
                          <video
                            src={formData.video}
                            controls
                            playsInline
                            preload="metadata"
                            className="h-[360px] w-full object-contain bg-black"
                          />
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={removeProductVideo}
                            className="w-full sm:w-[150px]"
                          >
                            Remove Video
                          </Button>
                        </div>
                      </div>
                    ) : null}
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
                        onCheckedChange={(checked) =>
                          setFormData({
                            ...formData,
                            is_on_sale: checked,
                            discount_price: checked ? formData.discount_price : ''
                          })
                        }
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
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.show_free_shipping}
                        onCheckedChange={(checked) => setFormData({ ...formData, show_free_shipping: checked })}
                      />
                      <Label>Free Shipping</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.show_returns}
                        onCheckedChange={(checked) => setFormData({ ...formData, show_returns: checked })}
                      />
                      <Label>7-Day Returns</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.show_reusable_container}
                        onCheckedChange={(checked) => setFormData({ ...formData, show_reusable_container: checked })}
                      />
                      <Label>Reusable Container</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={formData.show_gift_packaging}
                        onCheckedChange={(checked) => setFormData({ ...formData, show_gift_packaging: checked })}
                      />
                      <Label>Gift Packaging</Label>
                    </div>
                  </div>
                  {formData.show_gift_packaging && (
                    <div className="rounded-md border bg-muted/20 p-4 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium">Gift Options</h3>
                          <p className="text-sm text-muted-foreground">Customers can select one active option per cart item.</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addGiftPackagingOption}>
                          <Plus className="mr-1 h-4 w-4" />
                          Add Option
                        </Button>
                      </div>
                      {formData.gift_packaging_options.length === 0 && (
                        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                          No gift options configured. Add an option to show gift packaging in cart.
                        </p>
                      )}
                      {formData.gift_packaging_options.map((option, index) => (
                        <div key={option.id || index} className="space-y-4 rounded-md border bg-background p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">Option {index + 1}</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeGiftPackagingOption(index)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="md:col-span-2">
                              <Label htmlFor={`gift-option-title-${index}`}>Title</Label>
                              <Input
                                id={`gift-option-title-${index}`}
                                value={option.title}
                                onChange={(event) => updateGiftPackagingOption(index, 'title', event.target.value)}
                                className="mt-1"
                                placeholder="Gift box"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`gift-option-price-${index}`}>Price (₹)</Label>
                              <Input
                                id={`gift-option-price-${index}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={option.price}
                                onChange={(event) => updateGiftPackagingOption(index, 'price', event.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div className="md:col-span-3">
                              <Label htmlFor={`gift-option-description-${index}`}>Description</Label>
                              <Textarea
                                id={`gift-option-description-${index}`}
                                value={option.description}
                                onChange={(event) => updateGiftPackagingOption(index, 'description', event.target.value)}
                                className="mt-1"
                                placeholder="Describe this gift packaging option"
                              />
                            </div>
                            <div>
                              <Label htmlFor={`gift-option-sort-${index}`}>Sort Order</Label>
                              <Input
                                id={`gift-option-sort-${index}`}
                                type="number"
                                value={option.sort_order}
                                onChange={(event) => updateGiftPackagingOption(index, 'sort_order', event.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div className="flex items-end gap-3 pb-2">
                              <Switch
                                checked={option.message_enabled}
                                onCheckedChange={(checked) => updateGiftPackagingOption(index, 'message_enabled', checked)}
                              />
                              <Label>Message Enabled</Label>
                            </div>
                            <div className="flex items-end gap-3 pb-2">
                              <Switch
                                checked={option.is_active}
                                onCheckedChange={(checked) => updateGiftPackagingOption(index, 'is_active', checked)}
                              />
                              <Label>Active</Label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Additional Details */}
                  <div className="pt-4 border-t space-y-4">
                    <h3 className="font-medium">Additional Details</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label htmlFor="materials">Materials Used</Label>
                        <div className="mt-1">
                          <RichTextEditor
                            value={formData.materials}
                            onChange={(html) => setFormData((prev) => ({
                              ...prev,
                              materials: html,
                            }))}
                            minHeightClassName="min-h-[110px]"
                            testId="product-materials-input"
                          />
                        </div>
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
                      <div className="mt-1">
                        <RichTextEditor
                          value={formData.care_instructions}
                          onChange={(html) => setFormData((prev) => ({
                            ...prev,
                            care_instructions: html,
                          }))}
                          minHeightClassName="min-h-[90px]"
                          testId="product-care-instructions-input"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="shipping_info">Shipping Information</Label>
                      <div className="mt-1">
                        <RichTextEditor
                          value={formData.shipping_info}
                          onChange={(html) => setFormData((prev) => ({
                            ...prev,
                            shipping_info: html,
                          }))}
                          minHeightClassName="min-h-[90px]"
                          testId="product-shipping-info-input"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ==================== COLORS TAB ==================== */}
                <TabsContent value="colors" className="space-y-6 mt-4">
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
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
                    <>
                      {colorCropModalOpen && pendingColorImageUrl && (
                        <div ref={colorCropSectionRef} className="space-y-4 rounded-xl border bg-background p-4 shadow-sm">
                          <div>
                            <h3 className="text-base font-semibold">Crop color image</h3>
                            <p className="text-sm text-muted-foreground">
                              Adjust the crop for a 3:4 color image before uploading.
                            </p>
                          </div>

                          <div className="relative h-[420px] overflow-hidden rounded-lg bg-black">
                            <Cropper
                              image={pendingColorImageUrl}
                              crop={colorCrop}
                              zoom={colorZoom}
                              aspect={3 / 4}
                              onCropChange={setColorCrop}
                              onZoomChange={setColorZoom}
                              onCropComplete={onColorCropComplete}
                              showGrid={true}
                            />
                          </div>

                          <div className="flex items-center gap-3">
                            <Label htmlFor="color-image-zoom" className="min-w-[48px] text-sm">
                              Zoom
                            </Label>
                            <input
                              id="color-image-zoom"
                              type="range"
                              min="1"
                              max="3"
                              step="0.1"
                              value={colorZoom}
                              onChange={(e) => setColorZoom(Number(e.target.value))}
                              className="w-full"
                            />
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={closeColorImageCropModal}
                              disabled={uploadingColorImage}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={handleColorCropAndUpload}
                              disabled={uploadingColorImage}
                            >
                              {uploadingColorImage ? 'Uploading...' : 'Crop & Upload'}
                            </Button>
                          </div>
                        </div>
                      )}
                    <div className="space-y-6">
                      {/* Existing Colors with Image Galleries */}
                      {formData.color_options.map((color, colorIndex) => {
                        const hasDualColor = color.hex_code_secondary && color.hex_code_secondary !== color.hex_code;
                        return (
                        <div key={color.id} className="border rounded-lg p-4 space-y-4">
                          <div className="flex flex-col items-start justify-between gap-4 md:flex-row">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center gap-3">
                                {/* Dual or Single color swatch preview */}
                                <div className="w-10 h-10 rounded-full border-2 border-border shadow-sm overflow-hidden">
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

                              {editingColorIndex === colorIndex ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div>
                                      <Label className="text-xs">Name</Label>
                                      <Input
                                        value={color.name}
                                        onChange={(e) => updateColorOption(colorIndex, 'name', e.target.value)}
                                        placeholder="Color name"
                                        className="mt-1"
                                      />
                                    </div>

                                    <div>
                                      <Label className="text-xs">Primary Color</Label>
                                      <div className="flex gap-1 mt-1">
                                        <Input
                                          type="color"
                                          value={color.hex_code || '#F5F0E8'}
                                          onChange={(e) => updateColorOption(colorIndex, 'hex_code', e.target.value)}
                                          className="w-10 h-9 p-1 cursor-pointer"
                                        />
                                        <Input
                                          value={color.hex_code || ''}
                                          onChange={(e) => updateColorOption(colorIndex, 'hex_code', e.target.value)}
                                          className="flex-1 text-xs"
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <Label className="text-xs">Secondary Color (optional)</Label>
                                      <div className="flex gap-1 mt-1">
                                        <Input
                                          type="color"
                                          value={color.hex_code_secondary || '#FFFFFF'}
                                          onChange={(e) => updateColorOption(colorIndex, 'hex_code_secondary', e.target.value)}
                                          className="w-10 h-9 p-1 cursor-pointer"
                                        />
                                        <Input
                                          value={color.hex_code_secondary || ''}
                                          onChange={(e) => updateColorOption(colorIndex, 'hex_code_secondary', e.target.value)}
                                          placeholder="Leave empty for single"
                                          className="flex-1 text-xs"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                </div>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1">
                              {editingColorIndex === colorIndex ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingColorIndex(null)}
                                >
                                  <Check className="h-4 w-4 mr-1" /> Done
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingColorIndex(editingColorIndex === colorIndex ? null : colorIndex)}
                                aria-label={`Edit color ${color.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeColorOption(colorIndex)}
                                className="text-destructive hover:text-destructive"
                                aria-label={`Remove color ${color.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* Image Gallery for this color (up to 5 images) */}
                          <div>
                            <Label className="text-sm mb-2 block">
                              <Image className="h-4 w-4 inline mr-1" />
                              Images for {color.name} (up to 5)
                            </Label>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                              {[0, 1, 2, 3, 4].map((imageIndex) => {
                                const image = color.images?.[imageIndex];
                                const imageUrl = getThumbImage(image);
                                const recropImageUrl = normalizeImageUrl(image);
                                return (
                                    <div
                                      key={imageIndex}
                                      className="space-y-1"
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                      onDrop={(e) =>{
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (uploadingColorImage) return;

                                        const file = e.dataTransfer?.files?.[0];
                                        if(!file) return

                                        openColorImageCropper(file, colorIndex, imageIndex)
                                      }}  
                                    >  

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
                                                aria-label={`Move ${color.name} image ${imageIndex + 1} left`}
                                              >
                                                <ChevronLeft className="h-3 w-3" />
                                              </button>
                                            )}
                                            {imageIndex < 4 && color.images?.[imageIndex + 1] && (
                                              <button
                                                type="button"
                                                onClick={() => moveColorImage(colorIndex, imageIndex, 'down')}
                                                className="p-1 bg-white rounded"
                                                aria-label={`Move ${color.name} image ${imageIndex + 1} right`}
                                              >
                                                <ChevronRight className="h-3 w-3" />
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
                                    <div className="space-y-1">
                                      <label htmlFor={`color-image-upload-${colorIndex}-${imageIndex}`}>
                                        <div className="inline-flex h-7 w-full cursor-pointer items-center justify-center rounded-md border px-2 text-xs font-medium hover:bg-muted">
                                          {uploadingColorImage ? 'Uploading...' : imageUrl ? 'Replace' : 'Upload / Drop'}
                                        </div>
                                      </label>
                                      <Input
                                        id={`color-image-upload-${colorIndex}-${imageIndex}`}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        onChange={(e) => handleColorImageUpload(e, colorIndex, imageIndex)}
                                        className="hidden"
                                        disabled={uploadingColorImage}
                                      />
                                      {imageUrl ? (
                                          <div className="grid grid-cols-2 gap-2">
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="h-7 text-xs"
                                              disabled={uploadingColorImage || imageIndex === 0}
                                              onClick={() => moveColorImage(colorIndex, imageIndex, 'up')}
                                              title="Move image left"
                                              aria-label={`Move ${color.name} image ${imageIndex + 1} left`}
                                            >
                                              <ChevronLeft className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="h-7 text-xs"
                                              disabled={uploadingColorImage || imageIndex >= ((color.images || []).filter(Boolean).length - 1)}
                                              onClick={() => moveColorImage(colorIndex, imageIndex, 'down')}
                                              title="Move image right"
                                              aria-label={`Move ${color.name} image ${imageIndex + 1} right`}
                                            >
                                              <ChevronRight className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        ) : null}  

                                        {imageUrl ? (
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="w-full h-7 text-xs"
                                            disabled={uploadingColorImage}
                                            onClick={() => handleExistingColorImageRecrop(recropImageUrl, colorIndex, imageIndex)}
                                          >
                                            {uploadingColorImage ? 'Uploading...' : 'Re-crop'}
                                          </Button>
                                        ) : null}

                                        {imageUrl ? (  
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="w-full h-7 text-xs text-destructive hover:text-destructive"
                                            disabled={uploadingColorImage}
                                            onClick={() => updateColorImage(colorIndex, imageIndex, '')}
                                          >
                                            Remove
                                          </Button>
                                        ) : null}

                                        {imageUrl ? (  
                                          <p className="text-[10px] text-muted-foreground">
                                            Re-crop or replace this slot without typing a URL.
                                          </p>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-3 rounded-lg border border-dashed p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <Label className="text-sm">Video for {color.name} (optional)</Label>
                                <p className="text-xs text-muted-foreground">
                                  Recommended: 9:16 vertical MP4 video, up to 100MB
                                </p>
                              </div>

                              <label htmlFor={`color-video-upload-${colorIndex}`}>
                                <div className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                                  {uploadingColorVideoIndex === colorIndex
                                    ? 'Uploading...'
                                    : color.video
                                      ? 'Replace Video'
                                      : 'Choose Video'}
                                </div>
                              </label>

                              <Input
                                id={`color-video-upload-${colorIndex}`}
                                type="file"
                                accept="video/mp4"
                                onChange={(e) => handleColorVideoUpload(e, colorIndex)}
                                className="hidden"
                                disabled={uploadingColorVideoIndex !== null}
                              />
                            </div>

                            {color.video ? (
                              <div className="space-y-3 rounded-lg border p-3">
                                <div className="overflow-hidden rounded-lg border bg-black">
                                  <video
                                    src={color.video}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="h-[320px] w-full object-contain bg-black"
                                  />
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row">
        
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => removeColorVideo(colorIndex)}
                                    className="w-full sm:w-[150px]"
                                  >
                                    Remove Video
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                      })}
                      
                      {/* Add New Color */}
                      <div className="border-2 border-dashed rounded-lg p-4 space-y-4">
                        <h4 className="font-medium text-sm">Add New Color</h4>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                          {newColorCropModalOpen && pendingNewColorImageUrl && (
                            <div ref={newColorCropSectionRef} className="space-y-4 rounded-xl border bg-background p-4 shadow-sm">
                              <div>
                                <h3 className="text-base font-semibold">Crop new color image</h3>
                                <p className="text-sm text-muted-foreground">
                                  Adjust the crop for a 3:4 image before adding this color.
                                </p>
                              </div>

                              <div className="relative h-[420px] overflow-hidden rounded-lg bg-black">
                                <Cropper
                                  image={pendingNewColorImageUrl}
                                  crop={newColorCrop}
                                  zoom={newColorZoom}
                                  aspect={3 / 4}
                                  onCropChange={setNewColorCrop}
                                  onZoomChange={setNewColorZoom}
                                  onCropComplete={onNewColorCropComplete}
                                  showGrid={true}
                                />
                              </div>

                              <div className="flex items-center gap-3">
                                <Label htmlFor="new-color-image-zoom" className="min-w-[48px] text-sm">
                                  Zoom
                                </Label>
                                <input
                                  id="new-color-image-zoom"
                                  type="range"
                                  min="1"
                                  max="3"
                                  step="0.1"
                                  value={newColorZoom}
                                  onChange={(e) => setNewColorZoom(Number(e.target.value))}
                                  className="w-full"
                                />
                              </div>

                              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={closeNewColorImageCropModal}
                                  disabled={uploadingColorImage}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  onClick={handleNewColorCropAndUpload}
                                  disabled={uploadingColorImage}
                                >
                                  {uploadingColorImage ? 'Uploading...' : 'Crop & Upload'}
                                </Button>
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            {[0, 1, 2, 3, 4].map((imageIndex) => {
                              const image = newColor.images[imageIndex];
                              const imageUrl = getThumbImage(image);
                              const recropImageUrl = normalizeImageUrl(image);

                              return (
                                <div key={imageIndex} className="space-y-2">
                                  <div
                                    className={`aspect-square overflow-hidden rounded-lg border bg-muted transition-colors ${
                                      draggingNewColorImageIndex === imageIndex ? 'border-foreground bg-muted/70' : ''
                                    }`}
                                    onDragOver={(e) => handleNewColorImageDragOver(e, imageIndex)}
                                    onDragLeave={handleNewColorImageDragLeave}
                                    onDrop={(e) => handleNewColorImageDrop(e, imageIndex)}
                                  >
                                    {imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt={`New color image ${imageIndex + 1}`}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-muted-foreground">
                                        <span>Image {imageIndex + 1}</span>
                                        <span>Drop image here</span>
                                      </div>
                                    )}
                                  </div>

                                  <label htmlFor={`new-color-image-upload-${imageIndex}`}>
                                    <div className="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border px-2 text-xs font-medium hover:bg-muted">
                                      {uploadingColorImage ? 'Uploading...' : imageUrl ? 'Replace' : 'Upload / Drop'}
                                    </div>
                                  </label>
                                  <Input
                                    id={`new-color-image-upload-${imageIndex}`}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={(e) => handleNewColorImageUpload(e, imageIndex)}
                                    className="hidden"
                                    disabled={uploadingColorImage}
                                  />

                                    {imageUrl ? (
                                      <div className="grid grid-cols-2 gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          disabled={uploadingColorImage || imageIndex === 0}
                                          onClick={() => moveNewColorImage(imageIndex, imageIndex - 1)}
                                          title="Move image left"
                                          aria-label={`Move new color image ${imageIndex + 1} left`}
                                        >
                                          <ChevronLeft className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          disabled={uploadingColorImage || imageIndex >= ((newColor.images || []).filter(Boolean).length - 1)}
                                          onClick={() => moveNewColorImage(imageIndex, imageIndex + 1)}
                                          title="Move image right"
                                          aria-label={`Move new color image ${imageIndex + 1} right`}
                                        >
                                          <ChevronRight className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ) : null}                                  

                                  {imageUrl ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        disabled={uploadingColorImage}
                                        onClick={() => handleNewColorImageRecrop(recropImageUrl, imageIndex)}
                                      >
                                        {uploadingColorImage ? 'Uploading...' : 'Re-crop'}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => {
                                          const nextImages = [...newColor.images];
                                          nextImages[imageIndex] = '';
                                          setNewColor({ ...newColor, images: nextImages });
                                        }}
                                      >
                                        Remove
                                      </Button>
                                      <p className="text-[11px] text-muted-foreground">
                                        Re-crop by selecting the file again.
                                      </p>
                                    </>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                      <div className="space-y-3 rounded-lg border border-dashed p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <Label className="text-sm">New Color Video (optional)</Label>
                            <p className="text-xs text-muted-foreground">
                              Recommended: 9:16 vertical MP4 video, up to 100MB
                            </p>
                          </div>

                          <label htmlFor="new-color-video-upload">
                            <div className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                              {uploadingNewColorVideo
                                ? 'Uploading...'
                                : newColor.video
                                  ? 'Replace Video'
                                  : 'Choose Video'}
                            </div>
                          </label>

                          <Input
                            id="new-color-video-upload"
                            type="file"
                            accept="video/mp4"
                            onChange={handleNewColorVideoUpload}
                            className="hidden"
                            disabled={uploadingNewColorVideo}
                          />
                        </div>

                        {newColor.video ? (
                          <div className="space-y-3 rounded-lg border p-3">
                            <div className="overflow-hidden rounded-lg border bg-black">
                              <video
                                src={newColor.video}
                                controls
                                playsInline
                                preload="metadata"
                                className="h-[320px] w-full object-contain bg-black"
                              />
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                              
                              <Button
                                type="button"
                                variant="outline"
                                onClick={removeNewColorVideo}
                                className="w-full sm:w-[150px]"
                              >
                                Remove Video
                              </Button>
                            </div>
                          </div>
                        ) : null}
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
                    </>
                  )}
                </TabsContent>

                {/* ==================== FRAGRANCES TAB ==================== */}
                <TabsContent value="fragrances" className="space-y-6 mt-4">
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
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
                        <div key={flavor.id} className="flex flex-col items-start gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row">
                          <div className="w-10 h-10 rounded-full bg-terracotta/20 flex items-center justify-center flex-shrink-0">
                            <Droplets className="h-5 w-5 text-terracotta" />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div>
                              <p className="font-medium">{flavor.name}</p>
                              <p className="text-sm text-muted-foreground">{flavor.description || 'No description'}</p>
                            </div>

                            {editingFlavorIndex === index ? (
                              <div className="space-y-2">
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
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1">
                            {editingFlavorIndex === index ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingFlavorIndex(null)}
                              >
                                <Check className="h-4 w-4 mr-1" /> Done
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingFlavorIndex(editingFlavorIndex === index ? null : index)}
                              aria-label={`Edit fragrance ${flavor.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFlavorOption(index)}
                              className="text-destructive hover:text-destructive"
                              aria-label={`Remove fragrance ${flavor.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Add New Fragrance */}
                      <div className="border-2 border-dashed rounded-lg p-4 space-y-3">
                        <h4 className="font-medium text-sm">Add New Fragrance</h4>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

                {/* ==================== PACK OPTIONS TAB ==================== */}
                <TabsContent value="packs" className="space-y-6 mt-4">
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <Label className="text-base font-medium">Pack Options</Label>
                      <p className="text-sm text-muted-foreground">
                        Pack options let customers choose Single, Pack of 2, Pack of 4, etc. Price and stock are managed per generated combination.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addPackOption}>
                      <Plus className="h-4 w-4 mr-2" /> Add Pack Option
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {(formData.pack_options || []).length === 0 ? (
                      <div className="rounded-lg border border-dashed py-10 text-center">
                        <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">No pack options</p>
                      </div>
                    ) : (
                      formData.pack_options.map((pack, index) => {
                        const multiplier = Math.max(parseInt(pack.multiplier ?? pack.pack_quantity, 10) || 1, 1);
                        const piecesIncluded = getBasePiecesPerUnit() * multiplier;
                        return (
                          <div key={pack.id || index} className="rounded-lg border p-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_180px_100px_48px] md:items-end">
                              <div>
                                <Label className="text-xs">Label</Label>
                                <Input
                                  value={pack.label || ''}
                                  onChange={(e) => updatePackOption(index, 'label', e.target.value)}
                                  placeholder={multiplier === 1 ? 'Single' : `Pack of ${multiplier}`}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Pack multiplier</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={pack.multiplier || '1'}
                                  onChange={(e) => updatePackOption(index, 'multiplier', e.target.value)}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Pieces included</Label>
                                <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                  {piecesIncluded}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pb-2">
                                <Switch
                                  checked={pack.is_active !== false}
                                  onCheckedChange={(checked) => updatePackOption(index, 'is_active', checked)}
                                />
                                <span className="text-sm">Active</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removePackOption(index)}
                                className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                                aria-label={`Remove pack ${pack.label || index + 1}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </TabsContent>

                {/* ==================== VARIANT STOCK TAB ==================== */}
                <TabsContent value="variants" className="space-y-4 mt-4">
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="font-medium">Variant Combination Stock</h3>
                      <p className="text-sm text-muted-foreground">
                        Manage price, sale price, SKU, and stock for each color + fragrance + pack combination
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateVariantCombinations}
                      disabled={generating || (formData.color_options.length === 0 && formData.flavor_options.length === 0 && formData.pack_options.length === 0)}
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
                        Add colors, fragrances, and/or pack options, then click "Generate Combinations"
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table className="min-w-[940px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Color</TableHead>
                            <TableHead>Fragrance</TableHead>
                            <TableHead>Pack</TableHead>
                            <TableHead className="w-24">SKU</TableHead>
                            <TableHead className="w-28">Price</TableHead>
                            <TableHead className="w-28">Sale Price</TableHead>
                            <TableHead className="w-24">Stock</TableHead>
                            <TableHead className="w-20">Active</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.variants.map((variant, index) => {
                            const colorOption = (formData.color_options || []).find((color) => color.id === variant.color_id);
                            const flavorOption = (formData.flavor_options || []).find((flavor) => flavor.id === variant.flavor_id);
                            const packOption = (formData.pack_options || []).find((pack) => pack.id === variant.pack_option_id);
                            const colorName = colorOption?.name || variant.color_name || '—';
                            const flavorName = flavorOption?.name || variant.flavor_name || '—';
                            const packName = packOption?.label || variant.pack_label || '—';
                            const hasDualColor = colorOption?.hex_code_secondary && colorOption?.hex_code_secondary !== colorOption?.hex_code;
                            return (
                            <TableRow key={variant.id} data-testid={`variant-row-${index}`}>
                              <TableCell>
                                {colorName !== '—' ? (
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
                                    <span>{colorName}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {flavorName !== '—' ? flavorName : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                {packName !== '—' ? (
                                  <div>
                                    <p>{packName}</p>
                                    {(packOption?.pieces_per_pack || variant.pieces_per_pack) ? (
                                      <p className="text-xs text-muted-foreground">
                                        {packOption?.pieces_per_pack || variant.pieces_per_pack} pieces
                                      </p>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
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
                                  min="0"
                                  step="0.01"
                                  value={variant.price_override ?? ''}
                                  onChange={(e) => updateVariant(index, 'price_override', e.target.value)}
                                  placeholder="Base"
                                  className="h-8 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={variant.sale_price ?? ''}
                                  onChange={(e) => updateVariant(index, 'sale_price', e.target.value)}
                                  placeholder="None"
                                  className="h-8 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
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
                                  aria-label={`Remove variant ${colorName} ${flavorName}`}
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
                    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:flex-row sm:flex-wrap sm:gap-4">
                      <div>
                        <span className="text-muted-foreground">Total Combinations:</span>
                        <span className="font-medium ml-2">
                          {formData.variants.filter(v => v.is_active !== false).length}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Stock:</span>
                        <span className="font-medium ml-2">
                          {formData.variants
                          .filter(v => v.is_active !== false)
                          .reduce((sum, v) => sum + (v.stock || 0), 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Out of Stock:</span>
                        <span className="font-medium ml-2 text-destructive">
                          {formData.variants.filter(v => v.is_active !== false && (v.stock || 0) === 0).length}
                        </span>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Submit Buttons */}
                <div className="mt-6 flex flex-col gap-3 border-t pt-4 sm:flex-row">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={requestCloseProductModal}
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
              </div>

              {discardProductChangesOpen && (
                <div
                  className="absolute inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[1px]"
                  role="presentation"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="discard-product-changes-title"
                    aria-describedby="discard-product-changes-description"
                    className="w-full max-w-[420px] rounded-2xl border border-border bg-background p-5 text-left shadow-2xl sm:p-6"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
                        <X className="h-4 w-4" strokeWidth={1.8} />
                      </div>

                      <div className="min-w-0">
                        <h2 id="discard-product-changes-title" className="font-heading text-lg text-foreground">
                          Discard unsaved changes?
                        </h2>
                        <p id="discard-product-changes-description" className="mt-2 text-sm leading-6 text-muted-foreground">
                          You have unsaved product changes. If you leave now, your changes will be lost.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse items-center justify-center gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-[150px]"
                        onClick={continueEditingProduct}
                      >
                        Continue Editing
                      </Button>

                      <Button
                        type="button"
                        className="w-full bg-red-700 text-white hover:bg-red-800 sm:w-[150px]"
                        onClick={closeProductModal}
                      >
                        Discard Changes
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        </div>
        <Dialog open={shopOrderOpen} onOpenChange={setShopOrderOpen}>
          <DialogContent className="w-[calc(100vw-1rem)] max-h-[88dvh] max-w-none overflow-y-auto p-4 sm:max-w-[760px] sm:p-6">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">Manage Shop Order</DialogTitle>
              <DialogDescription>
                Products higher in this list appear earlier on the Shop page.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-5">
              {SHOP_ORDER_GROUPS.map((group) => {
                const groupProducts = shopOrderGroups[group.value] || [];

                return (
                  <div key={group.value} className="rounded-lg border bg-white">
                    <div className="border-b px-4 py-3">
                      <h2 className="font-medium">{group.label}</h2>
                    </div>
                    <div className="divide-y">
                      {groupProducts.length === 0 ? (
                        <p className="px-4 py-5 text-sm text-muted-foreground">
                          No products in this group yet.
                        </p>
                      ) : (
                        groupProducts.map((product, productIndex) => {
                          const productThumbnail =
                            getFirstImageUrl(product.images, getThumbImage) ||
                            getFirstImageUrl(
                              (product.color_options || [])
                                .filter((color) => color?.is_active !== false)
                                .flatMap((color) => color?.images || []),
                              getThumbImage
                            ) ||
                            'https://via.placeholder.com/40';

                          return (
                            <div
                              key={product.id}
                              className="flex items-center justify-between gap-3 px-4 py-3"
                              data-testid={`shop-order-product-${product.id}`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <img
                                  src={productThumbnail}
                                  alt={product.name}
                                  className="h-12 w-10 rounded object-cover"
                                  onError={(e) => {
                                    e.currentTarget.src = 'https://via.placeholder.com/40';
                                  }}
                                />
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{product.name}</p>
                                  {product.sku ? (
                                    <p className="truncate text-xs text-muted-foreground">{product.sku}</p>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => moveShopOrderProduct(group.value, productIndex, 'up')}
                                  disabled={productIndex === 0 || savingShopOrder}
                                  aria-label={`Move ${product.name} up`}
                                  data-testid={`shop-order-up-${product.id}`}
                                >
                                  <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => moveShopOrderProduct(group.value, productIndex, 'down')}
                                  disabled={productIndex === groupProducts.length - 1 || savingShopOrder}
                                  aria-label={`Move ${product.name} down`}
                                  data-testid={`shop-order-down-${product.id}`}
                                >
                                  <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col-reverse items-center justify-center gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShopOrderOpen(false)}
                disabled={savingShopOrder}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="btn-primary"
                onClick={handleSaveShopOrder}
                disabled={savingShopOrder || prioritizedProductCount === 0}
                data-testid="save-shop-order-button"
              >
                {savingShopOrder ? 'Saving...' : 'Save Order'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <Input
          aria-label="Search products"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-10"
          data-testid="product-search"
        />
      </div>

      {/* Products Table */}
      <div className="rounded-xl bg-white card-shadow">
        <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Available Stock</TableHead>
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
                paginatedProducts.map((product) => {
                  const variantSummary = getAvailableVariantSummary(product);
                  const displayStock = variantSummary.count > 0 ? variantSummary.totalStock : product.stock;
                  const productThumbnail =
                    getFirstImageUrl(product.images, getThumbImage) ||
                    getFirstImageUrl(
                      (product.color_options || [])
                        .filter((color) => color?.is_active !== false)
                        .flatMap((color) => color?.images || []),
                      getThumbImage
                    ) ||
                    'https://via.placeholder.com/40';

                  return (
                    <TableRow key={product.id} data-testid={`product-row-${product.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img
                            src={productThumbnail}
                            alt={product.name}
                            className="w-10 h-12 object-cover rounded"
                            onError={(e) => {
                              e.currentTarget.src = 'https://via.placeholder.com/40';
                            }}
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
                        <div className="flex flex-col gap-1">
                          <span className={displayStock <= 5 ? 'text-destructive font-medium' : ''}>
                            {displayStock}
                          </span>
                          {displayStock === 0 ? (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full w-fit">
                              Out of Stock
                            </span>
                          ) : displayStock > 0 && displayStock <= 5 ? (
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full w-fit">
                              Low Stock
                            </span>
                          ) : null}
                        </div>
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
                          {product.is_bestseller && (
                            <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                              Bestseller
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
                          aria-label={`Edit ${product.name}`}
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`delete-product-${product.id}`}
                          aria-label={`Delete ${product.name}`}
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

        <div className="flex flex-col gap-4 border-t px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            Showing {showingStart}&ndash;{showingEnd} of {totalProducts} products
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
              >
                Previous
              </Button>
              <span className="min-w-[6.5rem] text-center">
                Page {safeCurrentPage} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>  
  );
}
