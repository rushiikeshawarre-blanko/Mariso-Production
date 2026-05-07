import React, { useState, useEffect, useRef } from 'react';
import Cropper from 'react-easy-crop';
import {
  getAdminProducts,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  createPresignedUpload,
  uploadFileToPresignedUrl,
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
import { Plus, Pencil, Trash2, Search, Palette, Droplets, X, Image, ChevronLeft, ChevronRight, Package, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';



const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
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

  const colorCropSectionRef = useRef(null);
  const newColorCropSectionRef = useRef(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    short_description: '',
    price: '',
    discount_price: '',
    category_id: '',
    sku: '',
    stock: '',
    images: [],
    video: '',
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

  const getCroppedImageBlob = async (imageSrc, cropPixels, fileType = 'image/jpeg') => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = cropPixels.width;
    canvas.height = cropPixels.height;

    context.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      cropPixels.width,
      cropPixels.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create cropped image blob'));
            return;
          }
          resolve(blob);
        },
        fileType,
        0.92
      );
    });
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
      const croppedBlob = await getCroppedImageBlob(
        pendingDefaultImageUrl,
        croppedAreaPixels,
        pendingDefaultImageFile.type
      );

      const croppedFile = new File(
        [croppedBlob],
        `cropped-${pendingDefaultImageFile.name}`,
        { type: croppedBlob.type || pendingDefaultImageFile.type }
      );

      await uploadDefaultImageFile(croppedFile, pendingDefaultImageIndex);
      closeDefaultImageCropModal();
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

  const uploadColorImageFile = async (file, colorIndex, imageIndex) => {
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

    try {
      setUploadingColorImage(true);

      const presigned = await createPresignedUpload({
        filename: file.name,
        content_type: file.type,
        folder: 'products/colors',
      });

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        file,
        presigned.content_type
      );

      updateColorImage(colorIndex, imageIndex, presigned.file_url);
      toast.success('Color image uploaded successfully');
    } catch (error) {
      console.error('Error uploading color image:', error);
      toast.error('Failed to upload color image');
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
      const croppedBlob = await getCroppedImageBlob(
        pendingColorImageUrl,
        colorCroppedAreaPixels,
        pendingColorImageFile.type
      );

      const croppedFile = new File(
        [croppedBlob],
        `cropped-${pendingColorImageFile.name}`,
        { type: croppedBlob.type || pendingColorImageFile.type }
      );

      await uploadColorImageFile(croppedFile, colorIndex, imageIndex);
      closeColorImageCropModal();
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

  const uploadNewColorImageFile = async (file, imageIndex) => {
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

    try {
      setUploadingColorImage(true);

      const presigned = await createPresignedUpload({
        filename: file.name,
        content_type: file.type,
        folder: 'products/colors',
      });

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        file,
        presigned.content_type
      );

      const nextImages = [...newColor.images];
      while (nextImages.length < 5) {
        nextImages.push('');
      }
      nextImages[imageIndex] = presigned.file_url;

      setNewColor((prev) => ({
        ...prev,
        images: nextImages,
      }));

      toast.success('New color image uploaded successfully');
    } catch (error) {
      console.error('Error uploading new color image:', error);
      toast.error('Failed to upload new color image');
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
      const croppedBlob = await getCroppedImageBlob(
        pendingNewColorImageUrl,
        newColorCroppedAreaPixels,
        pendingNewColorImageFile.type
      );

      const croppedFile = new File(
        [croppedBlob],
        `cropped-${pendingNewColorImageFile.name}`,
        { type: croppedBlob.type || pendingNewColorImageFile.type }
      );

      await uploadNewColorImageFile(croppedFile, pendingNewColorImageIndex);
      closeNewColorImageCropModal();
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

  const uploadDefaultImageFile = async (file, replaceIndex = null) => {
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

    try {
      setUploadingDefaultImage(true);

      const presigned = await createPresignedUpload({
        filename: file.name,
        content_type: file.type,
        folder: 'products/default',
      });

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        file,
        presigned.content_type
      );

      setFormData((prev) => {
        const currentImages = [...(prev.images || [])].filter(Boolean);

        if (typeof replaceIndex === 'number') {
          const nextImages = [...currentImages];
          nextImages[replaceIndex] = presigned.file_url;

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
          images: [...currentImages, presigned.file_url].slice(0, 5),
        };
      });  

      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Error uploading default image:', error);
      toast.error('Failed to upload image');
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
        presigned.content_type
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
        presigned.content_type
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
        presigned.content_type
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
      images: [],
      video: '',
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
    setNewColor({
      name: '',
      hex_code: '#F5F0E8',
      hex_code_secondary: '',
      images: ['', '', '', '', ''],
      video: ''
     });
    setNewFlavor({ name: '', description: '' });
    setActiveTab('basic');
    setEditingColorIndex(null);
    setEditingFlavorIndex(null);
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
      images: product.images || [],
      video: product.video || '',
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
    setEditingColorIndex(null);
    setEditingFlavorIndex(null);
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

  // ==================== VARIANT COMBINATIONS ====================

  const buildVariantCombinationsFromForm = () => {
    const existingVariantMap = new Map(
      formData.variants.map((variant) => [
        `${variant.color_id ?? 'null'}-${variant.flavor_id ?? 'null'}`,
        variant,
      ])
    );

    const generatedVariants = [];

    if (formData.color_options.length > 0 && formData.flavor_options.length > 0) {
      for (const color of formData.color_options) {
        for (const flavor of formData.flavor_options) {
          const comboKey = `${color.id}-${flavor.id}`;
          const existingVariant = existingVariantMap.get(comboKey);

          generatedVariants.push({
            id: existingVariant?.id || `temp-${Date.now()}-${generatedVariants.length}`,
            color_id: color.id,
            color_name: color.name,
            flavor_id: flavor.id,
            flavor_name: flavor.name,
            sku: existingVariant?.sku || '',
            price_override: existingVariant?.price_override ?? null,
            stock: existingVariant?.stock ?? 0,
            is_active: existingVariant?.is_active ?? true,
          });
        }
      }
    } else if (formData.color_options.length > 0) {
      for (const color of formData.color_options) {
        const comboKey = `${color.id}-null`;
        const existingVariant = existingVariantMap.get(comboKey);

        generatedVariants.push({
          id: existingVariant?.id || `temp-${Date.now()}-${generatedVariants.length}`,
          color_id: color.id,
          color_name: color.name,
          flavor_id: null,
          flavor_name: null,
          sku: existingVariant?.sku || '',
          price_override: existingVariant?.price_override ?? null,
          stock: existingVariant?.stock ?? 0,
          is_active: existingVariant?.is_active ?? true,
        });
      }
    } else if (formData.flavor_options.length > 0) {
      for (const flavor of formData.flavor_options) {
        const comboKey = `null-${flavor.id}`;
        const existingVariant = existingVariantMap.get(comboKey);

        generatedVariants.push({
          id: existingVariant?.id || `temp-${Date.now()}-${generatedVariants.length}`,
          color_id: null,
          color_name: null,
          flavor_id: flavor.id,
          flavor_name: flavor.name,
          sku: existingVariant?.sku || '',
          price_override: existingVariant?.price_override ?? null,
          stock: existingVariant?.stock ?? 0,
          is_active: existingVariant?.is_active ?? true,
        });
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
      images: (color.images || []).filter(url => url.trim() !== ''),
      video: color.video || ''
    }));
    
    const productData = {
      name: formData.name,
      description: formData.description,
      short_description: formData.short_description,
      price: parseFloat(formData.price) || 0,
      discount_price: formData.is_on_sale && formData.discount_price ? parseFloat(formData.discount_price) : null,
      category_id: formData.category_id,
      sku: formData.sku,
      stock: parseInt(formData.stock, 10) || 0,
      images: (formData.images || []).filter(Boolean).slice(0, 5),
      video: formData.video,
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
      await fetchData();
    } catch (error) {
      console.error('Error saving product:', error);
      const message = error.response?.data?.detail || 'Failed to save product';
      toast.error(message);
    }
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    
    try {
      await deleteProduct(productId);
      toast.success('Product deleted');
      await fetchData();
    } catch (error) {
      console.error('Error deleting product:', error);
      const message = error.response?.data?.detail || 'Failed to delete product';
      toast.error(message);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="btn-primary" data-testid="add-product-button">
              <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] max-w-none overflow-y-auto p-4 sm:max-w-[900px] sm:p-6">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </DialogTitle>
              <DialogDescription>
                Manage product details, variant options, pricing, and stock combinations.
              </DialogDescription>
            </DialogHeader>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
              <TabsList className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
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
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        const imageUrl = formData.images?.[imageIndex] || '';
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
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>                            
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="col-span-2"
                                  disabled={uploadingDefaultImage}
                                  onClick={() => handleDefaultImageRecrop(imageUrl, imageIndex)}
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
                          <label htmlFor="product-video-upload">
                            <div className="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
                              {uploadingProductVideo ? 'Uploading...' : 'Replace Video'}
                            </div>
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={removeProductVideo}
                            className="w-full sm:w-auto"
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
                  </div>
                  
                  {/* Additional Details */}
                  <div className="pt-4 border-t space-y-4">
                    <h3 className="font-medium">Additional Details</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
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
                          </div>
                          
                          {/* Image Gallery for this color (up to 5 images) */}
                          <div>
                            <Label className="text-sm mb-2 block">
                              <Image className="h-4 w-4 inline mr-1" />
                              Images for {color.name} (up to 5)
                            </Label>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                              {[0, 1, 2, 3, 4].map((imageIndex) => {
                                const imageUrl = color.images?.[imageIndex] || '';
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
                                              >
                                                <ChevronLeft className="h-3 w-3" />
                                              </button>
                                            )}
                                            {imageIndex < 4 && color.images?.[imageIndex + 1] && (
                                              <button
                                                type="button"
                                                onClick={() => moveColorImage(colorIndex, imageIndex, 'down')}
                                                className="p-1 bg-white rounded"
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
                                            onClick={() => handleExistingColorImageRecrop(imageUrl, colorIndex, imageIndex)}
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
                                  <label htmlFor={`color-video-upload-${colorIndex}`}>
                                    <div className="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
                                      {uploadingColorVideoIndex === colorIndex ? 'Uploading...' : 'Replace Video'}
                                    </div>
                                  </label>

                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => removeColorVideo(colorIndex)}
                                    className="w-full sm:w-auto"
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
                              const imageUrl = newColor.images[imageIndex] || '';

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
                                        onClick={() => handleNewColorImageRecrop(imageUrl, imageIndex)}
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
                              <label htmlFor="new-color-video-upload">
                                <div className="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted">
                                  {uploadingNewColorVideo ? 'Uploading...' : 'Replace Video'}
                                </div>
                              </label>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={removeNewColorVideo}
                                className="w-full sm:w-auto"
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
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
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

                {/* ==================== VARIANT STOCK TAB ==================== */}
                <TabsContent value="variants" className="space-y-4 mt-4">
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
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
                    <div className="overflow-x-auto rounded-lg border">
                      <Table className="min-w-[760px]">
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
      <div className="overflow-x-auto rounded-xl bg-white card-shadow">
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
              filteredProducts.map((product) => {
                const variantSummary = getAvailableVariantSummary(product);
                const displayStock = variantSummary.count > 0 ? variantSummary.totalStock : product.stock;
                const productThumbnail =
                  (product.images || []).filter(Boolean)[0] ||
                  (product.color_options || [])
                    .filter((color) => color?.is_active !== false)
                    .flatMap((color) => color?.images || [])
                    .filter(Boolean)[0] ||
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