import React, { useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { PlayCircle, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  clearPublicCatalogCache,
  createHomepagePresignedUpload,
  getAdminHomepageContent,
  getAdminCategories,
  updateAdminHomepageContent,
  uploadFileToPresignedUrl,
} from '../../lib/api';
import {
  clampHeroOverlayOpacity,
  createHomePageAdminDefaults,
  getHeroOverlayGradient,
  getSafeHeroHexColor,
  isValidHeroHexColor,
} from '../../lib/homePageDefaults';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';

const TEMPLATE_OPTIONS = {
  2: ['split', 'feature-side'],
  3: ['feature-two', 'equal-three'],
  4: ['grid-four', 'feature-three'],
  5: ['feature-four'],
  6: ['grid-six', 'feature-five'],
};

const EDITOR_SECTIONS = [
  { id: 'announcement', label: 'Announcement' },
  { id: 'hero', label: 'Hero' },
  { id: 'featured_collection', label: 'Featured' },
  { id: 'shop_by_category', label: 'Categories' },
  { id: 'crafted_with_intention', label: 'Intention' },
  { id: 'bestsellers', label: 'Bestsellers' },
  { id: 'supporting_artisans', label: 'Artisans' },
  { id: 'craft_process', label: 'Craft Process' },
  { id: 'faq_section', label: 'FAQ' },
  { id: 'reviews_section', label: 'Reviews' },
  { id: 'follow_journey', label: 'Journey' },
  { id: 'newsletter', label: 'Newsletter' },
];

const createClientId = () => (
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `homepage-item-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const cloneDraft = (value) => JSON.parse(JSON.stringify(value));
const optionalLink = (value) => value?.trim() || null;
const toSortOrder = (value) => Number(value) || 0;
const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_MEDIA_TYPES = ['video/mp4'];
const MAX_IMAGE_SIZE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
const HOMEPAGE_IMAGE_UPLOAD_OPTIONS = {
  'homepage/hero': { maxWidth: 1920, quality: 0.82 },
  'homepage/story': { maxWidth: 1200, quality: 0.82 },
  'homepage/artisans': { maxWidth: 1200, quality: 0.82 },
  'homepage/craft-process/images': { maxWidth: 1200, quality: 0.82 },
  'homepage/journey': { maxWidth: 1200, quality: 0.82 },
  'homepage/category-cards': { maxWidth: 900, quality: 0.8 },
};
const DEFAULT_HOMEPAGE_IMAGE_UPLOAD_OPTIONS = { maxWidth: 1200, quality: 0.82 };
const isGifFile = (file) => file?.type === 'image/gif';
const isGifUrl = (url) => String(url || '').split('?')[0].toLowerCase().endsWith('.gif');

const createHeroButton = () => ({
  id: createClientId(),
  label: '',
  link: '',
  style: 'primary',
  is_active: true,
  sort_order: 0,
});

const createCategoryCard = () => ({
  id: createClientId(),
  title: '',
  subtitle: '',
  image: '',
  link: '',
  category_id: '',
  is_active: true,
  sort_order: 0,
});

const createProcessCard = () => ({
  id: createClientId(),
  title: '',
  description: '',
  image: '',
  video: '',
  show_play_icon: false,
  link: '',
  is_active: true,
  sort_order: 0,
});

const createJourneyCard = () => ({
  id: createClientId(),
  image: '',
  alt_text: '',
  link: '',
  is_active: true,
  sort_order: 0,
});

const normalizeItemIds = (items = []) => items.map((item) => ({
  ...item,
  id: item.id || createClientId(),
}));

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => {
  canvas.toBlob((blob) => resolve(blob), type, quality);
});

const loadImageSource = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    resolve(image);
  };
  image.onerror = () => {
    reject(new Error('Failed to load image for optimization'));
  };
  image.setAttribute('crossOrigin', 'anonymous');
  image.src = src;
});

const loadImageFile = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  loadImageSource(objectUrl)
    .then((image) => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    })
    .catch(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for optimization'));
    });
});

const getOptimizedFilename = (filename, contentType) => {
  const extension = contentType === 'image/webp' ? 'webp' : 'jpg';
  const baseName = String(filename || 'homepage-image').replace(/\.[^.]+$/, '') || 'homepage-image';
  return `${baseName}.${extension}`;
};

const getHomepageImageUploadOptions = (folder) => (
  HOMEPAGE_IMAGE_UPLOAD_OPTIONS[folder] || DEFAULT_HOMEPAGE_IMAGE_UPLOAD_OPTIONS
);

const createOptimizedHomepageImageFile = async ({
  image,
  filename,
  folder,
  cropPixels = null,
}) => {
  const { maxWidth, quality } = getHomepageImageUploadOptions(folder);
  const sourceWidth = cropPixels?.width || image.naturalWidth || image.width;
  const sourceHeight = cropPixels?.height || image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Could not read image dimensions');
  }

  const scale = Math.min(1, maxWidth / sourceWidth);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image optimization is not supported in this browser');
  }

  if (cropPixels) {
    context.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      targetWidth,
      targetHeight
    );
  } else {
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
  }

  let optimizedType = 'image/webp';
  let optimizedBlob = await canvasToBlob(canvas, optimizedType, quality);

  if (!optimizedBlob || optimizedBlob.type !== optimizedType) {
    optimizedType = 'image/jpeg';
    optimizedBlob = await canvasToBlob(canvas, optimizedType, quality);
  }

  if (!optimizedBlob) {
    throw new Error('Failed to optimize image');
  }

  return new File(
    [optimizedBlob],
    getOptimizedFilename(filename, optimizedType),
    { type: optimizedType }
  );
};

const optimizeHomepageImageFile = async (file, folder) => {
  if (!file || file.type === 'image/gif') return file;

  const image = await loadImageFile(file);
  return createOptimizedHomepageImageFile({ image, filename: file.name, folder });
};

const cropHomepageImageFile = async (imageSrc, cropPixels, originalFilename, folder) => {
  const image = await loadImageSource(imageSrc);
  return createOptimizedHomepageImageFile({
    image,
    filename: originalFilename,
    folder,
    cropPixels,
  });
};

const normalizeDraft = (savedContent) => {
  const defaults = createHomePageAdminDefaults();
  if (!savedContent) return defaults;

  return {
    announcement: {
      ...defaults.announcement,
      ...savedContent.announcement,
    },
    hero: {
      ...defaults.hero,
      ...savedContent.hero,
      buttons: normalizeItemIds(savedContent.hero?.buttons || []),
    },
    featured_collection: {
      ...defaults.featured_collection,
      ...savedContent.featured_collection,
    },
    shop_by_category: {
      ...defaults.shop_by_category,
      ...savedContent.shop_by_category,
      cards: normalizeItemIds(savedContent.shop_by_category?.cards || []),
    },
    crafted_with_intention: {
      ...defaults.crafted_with_intention,
      ...savedContent.crafted_with_intention,
      paragraphs: Array.isArray(savedContent.crafted_with_intention?.paragraphs)
        ? savedContent.crafted_with_intention.paragraphs
        : defaults.crafted_with_intention.paragraphs,
    },
    bestsellers: {
      ...defaults.bestsellers,
      ...savedContent.bestsellers,
    },
    supporting_artisans: {
      ...defaults.supporting_artisans,
      ...savedContent.supporting_artisans,
      paragraphs: Array.isArray(savedContent.supporting_artisans?.paragraphs)
        ? savedContent.supporting_artisans.paragraphs
        : defaults.supporting_artisans.paragraphs,
    },
    craft_process: {
      ...defaults.craft_process,
      ...savedContent.craft_process,
      cards: normalizeItemIds(savedContent.craft_process?.cards || []),
    },
    faq_section: {
      ...defaults.faq_section,
      ...savedContent.faq_section,
    },
    reviews_section: {
      ...defaults.reviews_section,
      ...savedContent.reviews_section,
    },
    follow_journey: {
      ...defaults.follow_journey,
      ...savedContent.follow_journey,
      cards: normalizeItemIds(savedContent.follow_journey?.cards || []),
    },
    newsletter: {
      ...defaults.newsletter,
      ...savedContent.newsletter,
    },
  };
};

const Field = ({ label, value, onChange, placeholder = '', type = 'text', required = false }) => (
  <div>
    <Label>{label}</Label>
    <Input
      type={type}
      value={value ?? ''}
      onChange={(event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value)}
      placeholder={placeholder}
      required={required}
      className="mt-1"
    />
  </div>
);

const HeroOpacityField = ({ value, onChange }) => {
  const normalizedValue = clampHeroOverlayOpacity(value);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label>Overlay Opacity</Label>
        <span className="text-xs text-muted-foreground">{normalizedValue}%</span>
      </div>
      <div className="mt-1 grid gap-3 sm:grid-cols-[1fr_96px]">
        <Input
          type="range"
          min="0"
          max="80"
          value={normalizedValue}
          onChange={(event) => onChange(clampHeroOverlayOpacity(event.target.value))}
        />
        <Input
          type="number"
          min="0"
          max="80"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onChange(clampHeroOverlayOpacity(event.target.value))}
        />
      </div>
    </div>
  );
};

const ColorField = ({ label, value, fallback, onChange }) => {
  const textValue = value ?? '';
  const pickerValue = getSafeHeroHexColor(textValue, fallback);
  const isInvalid = textValue && !isValidHeroHexColor(textValue);

  return (
    <div className="w-full max-w-[260px]">
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <Input
          type="color"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} picker`}
          className="h-10 w-10 shrink-0 cursor-pointer p-1"
        />
        <Input
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder={fallback}
          aria-invalid={isInvalid ? 'true' : 'false'}
          className="h-10 w-[138px] max-w-[calc(100vw-6rem)] font-mono text-sm uppercase"
        />
      </div>
      {isInvalid ? (
        <p className="mt-1 text-xs text-muted-foreground">Use a 6-digit hex color, for example {fallback}.</p>
      ) : null}
    </div>
  );
};

const MediaField = ({ label, value, onChange, folder, mediaType = 'image', cropAspect = null, cropTitle = '' }) => {
  const inputRef = React.useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [pendingCropFile, setPendingCropFile] = useState(null);
  const [pendingCropImageUrl, setPendingCropImageUrl] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const isVideo = mediaType === 'video';
  const acceptedTypes = isVideo ? VIDEO_MEDIA_TYPES : IMAGE_MEDIA_TYPES;
  const maxSizeBytes = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
  const sizeLabel = isVideo ? '100MB' : '30MB';
  const formatLabel = isVideo ? 'MP4' : 'JPG, JPEG, PNG, GIF, or WEBP';
  const shouldCrop = !isVideo && Boolean(cropAspect);

  const uploadMediaFile = async (file) => {
    setUploading(true);
    setUploadError('');
    const uploadFile = isVideo ? file : await optimizeHomepageImageFile(file, folder);
    const presigned = await createHomepagePresignedUpload({
      filename: uploadFile.name,
      content_type: uploadFile.type,
      folder,
    });

    await uploadFileToPresignedUrl(
      presigned.upload_url,
      uploadFile,
      presigned.content_type,
      presigned.cache_control
    );
    onChange(presigned.file_url);
    toast.success(`${label} uploaded. Save Homepage to publish this change.`);
  };

  const uploadCroppedImage = async () => {
    if (!pendingCropFile || !pendingCropImageUrl || !croppedAreaPixels) {
      const message = 'Please adjust the crop before uploading.';
      setUploadError(message);
      toast.error(message);
      return;
    }

    try {
      setUploading(true);
      setUploadError('');
      const uploadFile = await cropHomepageImageFile(
        pendingCropImageUrl,
        croppedAreaPixels,
        pendingCropFile.name,
        folder
      );
      const presigned = await createHomepagePresignedUpload({
        filename: uploadFile.name,
        content_type: uploadFile.type,
        folder,
      });

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        uploadFile,
        presigned.content_type,
        presigned.cache_control
      );
      onChange(presigned.file_url);
      toast.success(`${label} uploaded. Save Homepage to publish this change.`);
      closeCropDialog();
    } catch (error) {
      console.error(`Error uploading ${label}:`, error);
      const detail = error?.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : `Failed to upload ${label.toLowerCase()}.`;
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const closeCropDialog = () => {
    if (pendingCropImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pendingCropImageUrl);
    }

    setCropDialogOpen(false);
    setPendingCropFile(null);
    setPendingCropImageUrl('');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const openCropDialog = (file, imageUrl) => {
    if (pendingCropImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pendingCropImageUrl);
    }

    setPendingCropFile(file);
    setPendingCropImageUrl(imageUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropDialogOpen(true);
  };

  const openExistingCropDialog = () => {
    if (!value || isGifUrl(value)) return;
    const filename = `${String(label || 'homepage-image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'homepage-image'}.jpg`;
    openCropDialog(new File([], filename, { type: 'image/jpeg' }), value);
  };

  const handleUrlChange = (event) => {
    setUploadError('');
    onChange(event.target.value);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!acceptedTypes.includes(file.type)) {
      const message = `Upload a ${formatLabel} ${isVideo ? 'video' : 'image'}.`;
      setUploadError(message);
      toast.error(message);
      return;
    }

    if (file.size > maxSizeBytes) {
      const message = `${isVideo ? 'Video' : 'Image'} size must be ${sizeLabel} or less.`;
      setUploadError(message);
      toast.error(message);
      return;
    }

    try {
      if (shouldCrop && !isGifFile(file)) {
        openCropDialog(file, URL.createObjectURL(file));
        return;
      }

      await uploadMediaFile(file);
    } catch (error) {
      console.error(`Error uploading ${label}:`, error);
      const detail = error?.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : `Failed to upload ${label.toLowerCase()}.`;
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value ?? ''} onChange={handleUrlChange} placeholder="Paste a URL or upload a file" />
      {value ? (
        isVideo ? (
          <video className="max-h-52 w-full rounded-md border bg-black object-contain" src={value} controls preload="metadata">
            <track kind="captions" />
          </video>
        ) : (
          <img className="max-h-52 w-full rounded-md border bg-muted object-contain" src={value} alt={`${label} preview`} />
        )
      ) : (
        <p className="text-xs text-muted-foreground">No media selected.</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        onChange={handleUpload}
        disabled={uploading}
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Uploading...' : value ? 'Replace' : 'Upload'}
        </Button>
        {value && shouldCrop && !isGifUrl(value) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={openExistingCropDialog}
          >
            Re-crop
          </Button>
        ) : null}
        {value ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => {
              setUploadError('');
              onChange('');
            }}
          >
            Remove
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">{formatLabel}, up to {sizeLabel}</span>
      </div>
      {uploadError ? <p className="text-sm text-red-700">{uploadError}</p> : null}
      <Dialog
        open={cropDialogOpen}
        onOpenChange={(open) => {
          if (!open && !uploading) closeCropDialog();
        }}
      >
        <DialogContent className="max-w-3xl">
          <div className="flex flex-col space-y-1.5 text-center sm:text-left">
            <DialogTitle>{cropTitle || `Crop ${label}`}</DialogTitle>
            <DialogDescription>
              Compose the image before uploading. GIF images upload without cropping.
            </DialogDescription>
          </div>
          <div className="space-y-4">
            <div className="relative h-[420px] overflow-hidden rounded-md bg-black">
              {pendingCropImageUrl ? (
                <Cropper
                  image={pendingCropImageUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={cropAspect || 1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                />
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor={`${folder}-crop-zoom`} className="min-w-[48px] text-sm">
                Zoom
              </Label>
              <Input
                id={`${folder}-crop-zoom`}
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                disabled={uploading}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button type="button" variant="outline" disabled={uploading} onClick={closeCropDialog}>
              Cancel
            </Button>
            <Button type="button" disabled={uploading} onClick={uploadCroppedImage}>
              {uploading ? 'Uploading...' : 'Apply Crop'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const TextField = ({ label, value, onChange, rows = 3, required = false }) => (
  <div>
    <Label>{label}</Label>
    <Textarea
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      required={required}
      className="mt-1"
    />
  </div>
);

const Toggle = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-sm font-medium">
    <input type="checkbox" checked={checked !== false} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </label>
);

const SectionPanel = ({ title, description, children }) => (
  <section className="space-y-5 rounded-xl border border-border/70 bg-white p-5 shadow-sm sm:p-6">
    <div>
      <h2 className="font-heading text-2xl">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </section>
);

const CardPanel = ({ label, onRemove, children }) => (
  <div className="space-y-4 rounded-lg border border-border bg-[#FBF9F6] p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-medium">{label}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRemove}>
        <Trash2 className="mr-1.5 h-4 w-4" />
        Remove
      </Button>
    </div>
    {children}
  </div>
);

const sortedActiveItems = (items = []) => items
  .filter((item) => item?.is_active !== false)
  .slice()
  .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));

const PreviewPanel = ({ children }) => (
  <div className="space-y-4 rounded-xl border border-dashed border-[#D5C8B9] bg-[#FBF9F6] p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Preview</h3>
      <span className="rounded-full bg-[#EFE6DD] px-2.5 py-1 text-[11px] font-medium text-foreground/70">Live draft</span>
    </div>
    {children}
  </div>
);

const SectionActiveNote = ({ isActive }) => (
  isActive === false ? (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      This section is inactive and will be hidden on the published homepage.
    </p>
  ) : null
);

const EmptyPreviewNote = ({ children }) => (
  <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
    {children}
  </p>
);

const SectionHeadingPreview = ({ section, note }) => (
  <PreviewPanel>
    <SectionActiveNote isActive={section.is_active} />
    <div className="rounded-lg bg-white p-5 text-center shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{section.eyebrow}</p>
      <h4 className="mt-2 font-heading text-2xl text-foreground">{section.heading}</h4>
      {section.subheading ? <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{section.subheading}</p> : null}
      {section.view_all_label ? (
        <span className="mt-4 inline-flex rounded-full border border-foreground/20 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em]">
          {section.view_all_label}
        </span>
      ) : null}
    </div>
    {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
  </PreviewPanel>
);

const AnnouncementPreview = ({ announcement }) => {
  const text = String(announcement.announcement_text || '').trim();

  return (
    <PreviewPanel>
      {announcement.announcement_enabled && text ? (
        <div
          className="rounded-lg px-4 py-2 text-center text-sm font-medium"
          style={{
            backgroundColor: announcement.announcement_bg_color || '#8A6F55',
            color: announcement.announcement_text_color || '#FFFFFF',
          }}
        >
          {text}
        </div>
      ) : (
        <EmptyPreviewNote>The announcement banner is hidden.</EmptyPreviewNote>
      )}
    </PreviewPanel>
  );
};

const HeroPreview = ({ hero }) => {
  const defaults = createHomePageAdminDefaults();
  const buttons = sortedActiveItems(hero.buttons);
  const heroOverlayStyle = {
    background: getHeroOverlayGradient(hero.hero_overlay_opacity),
  };
  const heroEyebrowStyle = {
    color: getSafeHeroHexColor(hero.hero_eyebrow_color, defaults.hero.hero_eyebrow_color),
  };
  const heroTitleStyle = {
    color: getSafeHeroHexColor(hero.hero_title_color, defaults.hero.hero_title_color),
  };
  const heroSubtitleStyle = {
    color: getSafeHeroHexColor(hero.hero_subtitle_color, defaults.hero.hero_subtitle_color),
  };

  return (
    <PreviewPanel>
      <div className="relative isolate overflow-hidden rounded-xl bg-[#F3ECE4] px-5 py-10 text-center sm:px-8">
        {hero.background_image ? (
          <img src={hero.background_image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 -z-10" style={heroOverlayStyle} />
        <p className="text-[10px] uppercase tracking-[0.3em]" style={heroEyebrowStyle}>{hero.eyebrow}</p>
        <h4 className="mx-auto mt-3 max-w-lg whitespace-pre-line font-heading text-3xl leading-tight" style={heroTitleStyle}>
          {hero.heading}
        </h4>
        <p className="mt-3 font-serif-accent text-sm italic" style={heroSubtitleStyle}>{hero.subheading}</p>
        {buttons.length > 0 ? (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {buttons.map((button, index) => (
              <span
                key={button.id || `${button.label}-${index}`}
                className={`rounded-full px-5 py-2 text-[10px] font-medium uppercase tracking-[0.26em] ${
                  button.style === 'secondary'
                    ? 'border border-black/70 bg-transparent text-black'
                    : 'bg-black text-white'
                }`}
              >
                {button.label || 'Button label'}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </PreviewPanel>
  );
};

const getPreviewCategoryGridClass = (template, count) => {
  if (count <= 1) return 'grid grid-cols-1 gap-3';
  if (
    ['feature-side', 'feature-two', 'equal-three', 'feature-three', 'feature-four', 'grid-six', 'feature-five'].includes(template)
  ) {
    return 'grid grid-cols-1 gap-3 sm:grid-cols-3';
  }
  return 'grid grid-cols-1 gap-3 sm:grid-cols-2';
};

const getPreviewCategoryCardClass = (template, index) => (
  index === 0 && ['feature-side', 'feature-two', 'feature-three', 'feature-four', 'feature-five'].includes(template)
    ? 'sm:col-span-2 sm:row-span-2'
    : ''
);

const CategoryCollagePreview = ({ section, categories }) => {
  const cards = sortedActiveItems(section.cards)
    .map((card) => {
      const category = categories.find((item) => item.id === card.category_id);
      if (category) {
        return {
          ...card,
          title: category.name,
          subtitle: category.description,
          image: category.image,
        };
      }
      return card.title || card.subtitle || card.image ? card : null;
    })
    .filter(Boolean)
    .slice(0, Math.min(Math.max(Number(section.card_count) || 2, 2), 6));

  return (
    <PreviewPanel>
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{section.eyebrow}</p>
        <h4 className="mt-2 font-heading text-2xl">{section.heading}</h4>
      </div>
      {cards.length > 0 ? (
        <div className={getPreviewCategoryGridClass(section.template, cards.length)}>
          {cards.map((card, index) => {
            const featured = Boolean(getPreviewCategoryCardClass(section.template, index));
            return (
              <div
                key={card.id || `${card.title}-${index}`}
                className={`relative overflow-hidden rounded-lg bg-muted ${getPreviewCategoryCardClass(section.template, index)}`}
              >
                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.title || 'Category preview'}
                    className={`w-full object-cover ${featured ? 'h-52 sm:h-full sm:min-h-52' : 'h-36'}`}
                  />
                ) : (
                  <div className={`bg-[#E8DFD5] ${featured ? 'h-52 sm:h-full sm:min-h-52' : 'h-36'}`} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                  <p className="font-heading text-lg">{card.title}</p>
                  {card.subtitle ? <p className="truncate text-xs text-white/80">{card.subtitle}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyPreviewNote>Select active category cards to preview the collage.</EmptyPreviewNote>
      )}
    </PreviewPanel>
  );
};

const StoryPreview = ({ section, showBadge = false }) => (
  <PreviewPanel>
    <SectionActiveNote isActive={section.is_active} />
    <div className="grid overflow-hidden rounded-lg bg-white shadow-sm sm:grid-cols-[minmax(140px,0.42fr)_1fr]">
      <div className="relative min-h-44 bg-muted">
        {section.image ? <img src={section.image} alt="" className="h-full w-full object-cover" /> : null}
        {showBadge && section.floating_badge_text ? (
          <span className="absolute bottom-3 right-3 rounded-lg bg-white px-3 py-2 text-xs font-medium shadow">
            {section.floating_badge_text}
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{section.eyebrow}</p>
        <h4 className="mt-2 font-heading text-2xl">{section.heading}</h4>
        <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          {section.paragraphs.map((paragraph, index) => <p key={`preview-paragraph-${index}`}>{paragraph}</p>)}
        </div>
        {showBadge && section.button_label ? (
          <span className="mt-4 inline-flex rounded-full border border-foreground/25 px-4 py-2 text-[10px] uppercase tracking-[0.18em]">
            {section.button_label}
          </span>
        ) : null}
      </div>
    </div>
  </PreviewPanel>
);

const CraftProcessPreview = ({ section }) => {
  const cards = sortedActiveItems(section.cards);

  return (
    <PreviewPanel>
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{section.eyebrow}</p>
        <h4 className="mt-2 font-heading text-2xl">{section.heading}</h4>
      </div>
      {cards.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map((card, index) => (
            <div key={card.id || index} className="overflow-hidden rounded-lg bg-white shadow-sm">
              <div className="relative h-28 bg-muted">
                {card.image ? <img src={card.image} alt={card.title} className="h-full w-full object-cover" /> : null}
                {card.show_play_icon || card.video ? (
                  <PlayCircle className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />
                ) : null}
              </div>
              <div className="p-3">
                <p className="font-heading text-lg">{card.title}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{card.description}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPreviewNote>Add an active craft process card to preview it.</EmptyPreviewNote>
      )}
    </PreviewPanel>
  );
};

const ReviewsPreview = ({ section }) => (
  <PreviewPanel>
    <SectionActiveNote isActive={section.is_active} />
    <div className="rounded-lg bg-white p-5 text-center shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{section.eyebrow}</p>
      <h4 className="mt-2 font-heading text-2xl">{section.heading}</h4>
      <span className="mt-4 inline-flex rounded-full bg-[#EFE6DD] px-3 py-1.5 text-xs font-medium">
        Auto-scroll: {section.auto_scroll_enabled === false ? 'Disabled' : 'Enabled'}
      </span>
    </div>
    <p className="text-sm text-muted-foreground">Review cards come from approved feedback.</p>
  </PreviewPanel>
);

const JourneyPreview = ({ section }) => {
  const cards = sortedActiveItems(section.cards).filter((card) => card.image);

  return (
    <PreviewPanel>
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{section.eyebrow}</p>
        <h4 className="mt-2 font-heading text-2xl">{section.heading}</h4>
      </div>
      {cards.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((card, index) => (
            <img
              key={card.id || index}
              src={card.image}
              alt={card.alt_text || `Journey preview ${index + 1}`}
              className="aspect-square w-full rounded-lg object-cover"
            />
          ))}
        </div>
      ) : (
        <EmptyPreviewNote>Add an active image card to preview the journey grid.</EmptyPreviewNote>
      )}
    </PreviewPanel>
  );
};

const NewsletterPreview = ({ section }) => (
  <PreviewPanel>
    <SectionActiveNote isActive={section.is_active} />
    <div className="rounded-lg bg-primary p-6 text-center text-primary-foreground">
      <h4 className="font-heading text-2xl">{section.heading}</h4>
      <p className="mx-auto mt-2 max-w-lg text-sm text-primary-foreground/80">{section.subheading}</p>
      <div className="mx-auto mt-5 flex max-w-md flex-col gap-2 sm:flex-row">
        <span className="flex-1 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-left text-xs text-white/65">
          {section.input_placeholder}
        </span>
        <span className="rounded-full bg-white px-5 py-2 text-xs font-medium text-foreground">{section.button_label}</span>
      </div>
    </div>
  </PreviewPanel>
);

const validateLink = (value, label, required = false) => {
  const normalized = value?.trim() || '';
  if (!normalized) return required ? `${label} is required.` : '';
  if (/^(\/(?!\/)|#|https?:\/\/)/i.test(normalized)) return '';
  return `${label} must be an internal path, fragment, or http(s) URL.`;
};

const validateDraft = (draft, categories) => {
  if (!draft.hero.heading.trim()) return 'Hero heading is required.';
  const announcementLinkError = validateLink(draft.announcement.announcement_link, 'Announcement link');
  if (announcementLinkError) return announcementLinkError;
  for (const button of draft.hero.buttons) {
    if (!button.label.trim()) return 'Every hero button needs a label.';
    const linkError = validateLink(button.link, 'Hero button link', true);
    if (linkError) return linkError;
  }

  const count = Number(draft.shop_by_category.card_count);
  if (!Number.isInteger(count) || count < 2 || count > 6) return 'Category card count must be from 2 to 6.';
  if (!TEMPLATE_OPTIONS[count]?.includes(draft.shop_by_category.template)) {
    return 'Choose a valid category collage template for the selected card count.';
  }
  if (draft.shop_by_category.cards.length > 6) return 'Shop by Category supports at most 6 cards.';
  if (!draft.featured_collection.heading.trim()) return 'Featured Collection heading is required.';
  if (!draft.shop_by_category.heading.trim()) return 'Shop by Category heading is required.';
  if (!draft.crafted_with_intention.heading.trim()) return 'Crafted with Intention heading is required.';
  if (!draft.bestsellers.heading.trim()) return 'Bestsellers heading is required.';
  if (!draft.supporting_artisans.heading.trim()) return 'Supporting Our Artisans heading is required.';
  if (!draft.craft_process.heading.trim()) return 'Our Craft Process heading is required.';
  if (!draft.faq_section.heading.trim()) return 'FAQ heading is required.';
  if (!draft.reviews_section.heading.trim()) return 'Reviews heading is required.';
  if (!draft.follow_journey.heading.trim()) return 'Follow Our Journey heading is required.';
  if (!draft.newsletter.heading.trim()) return 'Newsletter heading is required.';

  const linkFields = [
    [draft.featured_collection.view_all_link, 'Featured View All link'],
    [draft.crafted_with_intention.button_link, 'Crafted with Intention button link'],
    [draft.bestsellers.view_all_link, 'Bestsellers View All link'],
    [draft.faq_section.view_all_link, 'FAQ View All link'],
  ];
  for (const [link, label] of linkFields) {
    const linkError = validateLink(link, label);
    if (linkError) return linkError;
  }
  for (const card of draft.shop_by_category.cards) {
    const category = categories.find((item) => item.id === card.category_id);
    const hasLegacyTitle = String(card.title || '').trim();
    if (!category && !hasLegacyTitle) return 'Select a category for every new Shop by Category card.';
    const linkError = category ? '' : validateLink(card.link, 'Category card link');
    if (linkError) return linkError;
  }
  for (const card of draft.craft_process.cards) {
    if (!card.title.trim()) return 'Every craft process card needs a title.';
    const linkError = validateLink(card.link, 'Craft process card link');
    if (linkError) return linkError;
  }
  for (const card of draft.follow_journey.cards) {
    if (!card.image.trim()) return 'Every journey card needs an image URL.';
    const linkError = validateLink(card.link, 'Journey card link');
    if (linkError) return linkError;
  }
  return '';
};

const resolveHeroColorForSave = (value, previousValue, fallback) => (
  getSafeHeroHexColor(value, getSafeHeroHexColor(previousValue, fallback))
);

const createPayload = (draft, categories, previousDraft) => ({
  ...draft,
  announcement: {
    ...draft.announcement,
    announcement_link: optionalLink(draft.announcement.announcement_link),
  },
  hero: {
    ...draft.hero,
    hero_overlay_opacity: clampHeroOverlayOpacity(draft.hero.hero_overlay_opacity),
    hero_eyebrow_color: resolveHeroColorForSave(
      draft.hero.hero_eyebrow_color,
      previousDraft?.hero?.hero_eyebrow_color,
      createHomePageAdminDefaults().hero.hero_eyebrow_color
    ),
    hero_title_color: resolveHeroColorForSave(
      draft.hero.hero_title_color,
      previousDraft?.hero?.hero_title_color,
      createHomePageAdminDefaults().hero.hero_title_color
    ),
    hero_subtitle_color: resolveHeroColorForSave(
      draft.hero.hero_subtitle_color,
      previousDraft?.hero?.hero_subtitle_color,
      createHomePageAdminDefaults().hero.hero_subtitle_color
    ),
    buttons: draft.hero.buttons.map((button) => ({
      ...button,
      sort_order: toSortOrder(button.sort_order),
    })),
  },
  shop_by_category: {
    ...draft.shop_by_category,
    card_count: Number(draft.shop_by_category.card_count),
    cards: draft.shop_by_category.cards.map((card) => {
      const categoryId = card.category_id?.trim() || null;
      const category = categories.find((item) => item.id === categoryId);

      return {
        ...card,
        title: category?.name || card.title || '',
        subtitle: category?.description || card.subtitle || '',
        image: category?.image || card.image || '',
        link: category
          ? `/shop?category=${encodeURIComponent(category.id)}`
          : optionalLink(card.link),
        category_id: categoryId,
        sort_order: toSortOrder(card.sort_order),
      };
    }),
  },
  crafted_with_intention: {
    ...draft.crafted_with_intention,
    button_link: optionalLink(draft.crafted_with_intention.button_link),
  },
  craft_process: {
    ...draft.craft_process,
    cards: draft.craft_process.cards.map((card) => ({
      ...card,
      video: card.video?.trim() || null,
      link: optionalLink(card.link),
      sort_order: toSortOrder(card.sort_order),
    })),
  },
  follow_journey: {
    ...draft.follow_journey,
    cards: draft.follow_journey.cards.map((card) => ({
      ...card,
      link: optionalLink(card.link),
      sort_order: toSortOrder(card.sort_order),
    })),
  },
});

const AdminHomePage = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const [draft, setDraft] = useState(() => createHomePageAdminDefaults());
  const [loadedDraft, setLoadedDraft] = useState(() => createHomePageAdminDefaults());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState('');

  useEffect(() => {
    const loadContent = async () => {
      const [contentResult, categoriesResult] = await Promise.allSettled([
        getAdminHomepageContent(),
        getAdminCategories(),
      ]);

      if (contentResult.status === 'fulfilled') {
        const content = contentResult.value;
        const nextDraft = normalizeDraft(content);
        setDraft(nextDraft);
        setLoadedDraft(cloneDraft(nextDraft));
      } else {
        console.error('Error loading homepage settings:', contentResult.reason);
        setError('Failed to load homepage settings. Default content is shown for editing.');
        toast.error('Failed to load homepage settings');
      }

      if (categoriesResult.status === 'fulfilled') {
        setCategories(categoriesResult.value || []);
      } else {
        console.error('Error loading homepage category options:', categoriesResult.reason);
        setCategoriesError('Failed to load categories. Existing legacy card previews are still available.');
        toast.error('Failed to load categories for homepage cards');
      }

      setLoading(false);
    };

    loadContent();
  }, []);

  const updateSection = (section, field, value) => {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  };

  const updateListItem = (section, index, field, value) => {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        cards: current[section].cards.map((item, itemIndex) => (
          itemIndex === index ? { ...item, [field]: value } : item
        )),
      },
    }));
  };

  const updateHeroButton = (index, field, value) => {
    setDraft((current) => ({
      ...current,
      hero: {
        ...current.hero,
        buttons: current.hero.buttons.map((button, buttonIndex) => (
          buttonIndex === index ? { ...button, [field]: value } : button
        )),
      },
    }));
  };

  const addCard = (section, itemFactory, maximum) => {
    setDraft((current) => {
      const items = current[section].cards || [];
      if (maximum && items.length >= maximum) {
        toast.error(`You can add up to ${maximum} category cards.`);
        return current;
      }
      return {
        ...current,
        [section]: {
          ...current[section],
          cards: [...items, itemFactory()],
        },
      };
    });
  };

  const removeCard = (section, index) => {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        cards: current[section].cards.filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  };

  const updateParagraph = (section, index, value) => {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        paragraphs: current[section].paragraphs.map((paragraph, paragraphIndex) => (
          paragraphIndex === index ? value : paragraph
        )),
      },
    }));
  };

  const addParagraph = (section) => {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        paragraphs: [...current[section].paragraphs, ''],
      },
    }));
  };

  const removeParagraph = (section, index) => {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        paragraphs: current[section].paragraphs.filter((_, paragraphIndex) => paragraphIndex !== index),
      },
    }));
  };

  const handleCardCountChange = (value) => {
    const count = Number(value);
    const templates = TEMPLATE_OPTIONS[count] || [];
    setDraft((current) => ({
      ...current,
      shop_by_category: {
        ...current.shop_by_category,
        card_count: count,
        template: templates.includes(current.shop_by_category.template)
          ? current.shop_by_category.template
          : templates[0],
      },
    }));
  };

  const handleReset = () => {
    setDraft(cloneDraft(loadedDraft));
    setError('');
    toast.success('Unsaved changes reset');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const validationError = validateDraft(draft, categories);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');
      const saved = await updateAdminHomepageContent(createPayload(draft, categories, loadedDraft));
      const nextDraft = normalizeDraft(saved);
      setDraft(nextDraft);
      setLoadedDraft(cloneDraft(nextDraft));
      clearPublicCatalogCache('content');
      toast.success('Homepage settings saved');
    } catch (saveError) {
      console.error('Error saving homepage settings:', saveError);
      const message = saveError?.response?.data?.detail || 'Failed to save homepage settings.';
      setError(typeof message === 'string' ? message : 'Failed to save homepage settings.');
      toast.error('Failed to save homepage settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading homepage settings...</p>;
  }

  return (
    <form className="space-y-6" onSubmit={handleSave} data-testid="admin-homepage-page">
      <div className="sticky top-4 z-20 flex flex-col justify-between gap-4 rounded-xl border border-border/70 bg-white/95 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-3xl">Home Page</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit storefront homepage content and preview your draft before publishing.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
            Reset Unsaved Changes
          </Button>
          <Button type="submit" className="btn-primary" disabled={saving} data-testid="save-homepage-button">
            {saving ? 'Saving...' : 'Save Homepage'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-2 rounded-xl bg-white p-2 shadow-sm">
        {EDITOR_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeSection === section.id
                ? 'bg-foreground text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {activeSection === 'announcement' ? (
        <SectionPanel title="Announcement Banner" description="A thin promotional banner shown above the homepage navbar.">
          <AnnouncementPreview announcement={draft.announcement} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <TextField
                label="Text"
                value={draft.announcement.announcement_text}
                onChange={(value) => updateSection('announcement', 'announcement_text', value)}
                rows={2}
              />
            </div>
            <Field
              label="Optional Link"
              value={draft.announcement.announcement_link}
              onChange={(value) => updateSection('announcement', 'announcement_link', value)}
              placeholder="/shop?featured=true"
            />
            <div className="md:col-span-2 grid gap-4 sm:grid-cols-2">
              <ColorField
                label="Background Color"
                value={draft.announcement.announcement_bg_color}
                fallback={createHomePageAdminDefaults().announcement.announcement_bg_color}
                onChange={(value) => updateSection('announcement', 'announcement_bg_color', value)}
              />
              <ColorField
                label="Text Color"
                value={draft.announcement.announcement_text_color}
                fallback={createHomePageAdminDefaults().announcement.announcement_text_color}
                onChange={(value) => updateSection('announcement', 'announcement_text_color', value)}
              />
            </div>
          </div>
          <Toggle
            label="Show announcement banner"
            checked={draft.announcement.announcement_enabled}
            onChange={(value) => updateSection('announcement', 'announcement_enabled', value)}
          />
        </SectionPanel>
      ) : null}

      {activeSection === 'hero' ? (
        <SectionPanel title="Hero" description="Headline, backdrop, and hero action buttons.">
          <HeroPreview hero={draft.hero} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.hero.eyebrow} onChange={(value) => updateSection('hero', 'eyebrow', value)} />
            <Field label="Subheading" value={draft.hero.subheading} onChange={(value) => updateSection('hero', 'subheading', value)} />
            <div className="md:col-span-2">
              <TextField label="Main Heading" value={draft.hero.heading} onChange={(value) => updateSection('hero', 'heading', value)} rows={2} required />
            </div>
            <div className="md:col-span-2">
              <MediaField
                label="Background Image URL"
                value={draft.hero.background_image}
                onChange={(value) => updateSection('hero', 'background_image', value)}
                folder="homepage/hero"
                cropAspect={16 / 9}
                cropTitle="Crop Hero Image"
              />
            </div>
            <div className="md:col-span-2">
              <HeroOpacityField
                value={draft.hero.hero_overlay_opacity}
                onChange={(value) => updateSection('hero', 'hero_overlay_opacity', value)}
              />
            </div>
            <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
              <ColorField
                label="Eyebrow Color"
                value={draft.hero.hero_eyebrow_color}
                fallback={createHomePageAdminDefaults().hero.hero_eyebrow_color}
                onChange={(value) => updateSection('hero', 'hero_eyebrow_color', value)}
              />
              <ColorField
                label="Title Color"
                value={draft.hero.hero_title_color}
                fallback={createHomePageAdminDefaults().hero.hero_title_color}
                onChange={(value) => updateSection('hero', 'hero_title_color', value)}
              />
              <ColorField
                label="Subtitle Color"
                value={draft.hero.hero_subtitle_color}
                fallback={createHomePageAdminDefaults().hero.hero_subtitle_color}
                onChange={(value) => updateSection('hero', 'hero_subtitle_color', value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Buttons</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => updateSection('hero', 'buttons', [...draft.hero.buttons, createHeroButton()])}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Button
            </Button>
          </div>
          <div className="space-y-4">
            {draft.hero.buttons.map((button, index) => (
              <CardPanel
                key={button.id}
                label={`Button ${index + 1}`}
                onRemove={() => updateSection('hero', 'buttons', draft.hero.buttons.filter((_, itemIndex) => itemIndex !== index))}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Label" value={button.label} onChange={(value) => updateHeroButton(index, 'label', value)} required />
                  <Field label="Link" value={button.link} onChange={(value) => updateHeroButton(index, 'link', value)} required />
                  <div>
                    <Label>Style</Label>
                    <select
                      className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={button.style}
                      onChange={(event) => updateHeroButton(index, 'style', event.target.value)}
                    >
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                    </select>
                  </div>
                  <Field label="Sort Order" type="number" value={button.sort_order} onChange={(value) => updateHeroButton(index, 'sort_order', value)} />
                </div>
                <Toggle label="Active" checked={button.is_active} onChange={(value) => updateHeroButton(index, 'is_active', value)} />
              </CardPanel>
            ))}
          </div>
        </SectionPanel>
      ) : null}

      {activeSection === 'featured_collection' ? (
        <SectionPanel title="Featured Collection" description="Products remain controlled by the featured product flag.">
          <SectionHeadingPreview
            section={draft.featured_collection}
            note="Products come from Featured products toggle."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.featured_collection.eyebrow} onChange={(value) => updateSection('featured_collection', 'eyebrow', value)} />
            <Field label="Heading" value={draft.featured_collection.heading} onChange={(value) => updateSection('featured_collection', 'heading', value)} required />
            <Field label="View All Label" value={draft.featured_collection.view_all_label} onChange={(value) => updateSection('featured_collection', 'view_all_label', value)} />
            <Field label="View All Link" value={draft.featured_collection.view_all_link} onChange={(value) => updateSection('featured_collection', 'view_all_link', value)} />
          </div>
          <Toggle label="Active" checked={draft.featured_collection.is_active} onChange={(value) => updateSection('featured_collection', 'is_active', value)} />
        </SectionPanel>
      ) : null}

      {activeSection === 'shop_by_category' ? (
        <SectionPanel title="Shop by Category" description="Choose categories and arrange their homepage collage placement. Category content is managed in Admin Categories.">
          <CategoryCollagePreview section={draft.shop_by_category} categories={categories} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.shop_by_category.eyebrow} onChange={(value) => updateSection('shop_by_category', 'eyebrow', value)} />
            <Field label="Heading" value={draft.shop_by_category.heading} onChange={(value) => updateSection('shop_by_category', 'heading', value)} required />
            <div>
              <Label>Card Count</Label>
              <select
                value={draft.shop_by_category.card_count}
                onChange={(event) => handleCardCountChange(event.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </div>
            <div>
              <Label>Collage Template</Label>
              <select
                value={draft.shop_by_category.template}
                onChange={(event) => updateSection('shop_by_category', 'template', event.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TEMPLATE_OPTIONS[draft.shop_by_category.card_count].map((template) => (
                  <option key={template} value={template}>{template}</option>
                ))}
              </select>
            </div>
          </div>
          {categoriesError ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {categoriesError}
            </p>
          ) : null}
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Cards ({draft.shop_by_category.cards.length}/6)</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => addCard('shop_by_category', createCategoryCard, 6)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Card
            </Button>
          </div>
          <div className="space-y-4">
            {draft.shop_by_category.cards.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No custom collage cards yet. Add cards to prepare a CMS-managed category collage.
              </p>
            ) : draft.shop_by_category.cards.map((card, index) => (
              <CardPanel key={card.id} label={`Card ${index + 1}`} onRemove={() => removeCard('shop_by_category', index)}>
                {(() => {
                  const category = categories.find((item) => item.id === card.category_id);
                  const hasLegacyCard = Boolean(card.title || card.subtitle || card.image || card.link);
                  const preview = category || (hasLegacyCard ? card : null);
                  const target = category
                    ? `/shop?category=${encodeURIComponent(category.id)}`
                    : card.link || '';
                  const targetDisplay = category ? 'Opens selected category page' : target;

                  return (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Category</Label>
                          <select
                            value={card.category_id || ''}
                            onChange={(event) => updateListItem('shop_by_category', index, 'category_id', event.target.value)}
                            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="">Select a category</option>
                            {card.category_id && !category ? (
                              <option value={card.category_id}>Unavailable category ({card.category_id})</option>
                            ) : null}
                            {categories.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}{item.is_active === false ? ' (inactive)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Field label="Sort Order" type="number" value={card.sort_order} onChange={(value) => updateListItem('shop_by_category', index, 'sort_order', value)} />
                      </div>
                      <Toggle label="Active" checked={card.is_active} onChange={(value) => updateListItem('shop_by_category', index, 'is_active', value)} />
                      {preview ? (
                        <div className="overflow-hidden rounded-lg border bg-white">
                          {preview.image ? (
                            <img className="h-44 w-full bg-muted object-cover" src={preview.image} alt={`${preview.name || preview.title} preview`} />
                          ) : (
                            <div className="flex h-44 items-center justify-center bg-muted text-sm text-muted-foreground">No category image</div>
                          )}
                          <div className="space-y-1 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {category ? 'Category preview' : 'Legacy card fallback preview'}
                            </p>
                            <p className="font-medium">{preview.name || preview.title}</p>
                            {preview.description || preview.subtitle ? (
                              <p className="text-sm text-muted-foreground">{preview.description || preview.subtitle}</p>
                            ) : null}
                            {targetDisplay ? <p className="truncate text-xs text-muted-foreground">{targetDisplay}</p> : null}
                          </div>
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                          Select a category to preview its homepage card.
                        </p>
                      )}
                    </>
                  );
                })()}
              </CardPanel>
            ))}
          </div>
        </SectionPanel>
      ) : null}

      {activeSection === 'crafted_with_intention' ? (
        <SectionPanel title="Crafted with Intention">
          <StoryPreview section={draft.crafted_with_intention} showBadge />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.crafted_with_intention.eyebrow} onChange={(value) => updateSection('crafted_with_intention', 'eyebrow', value)} />
            <Field label="Heading" value={draft.crafted_with_intention.heading} onChange={(value) => updateSection('crafted_with_intention', 'heading', value)} required />
            <Field label="Button Label" value={draft.crafted_with_intention.button_label} onChange={(value) => updateSection('crafted_with_intention', 'button_label', value)} />
            <Field label="Button Link" value={draft.crafted_with_intention.button_link} onChange={(value) => updateSection('crafted_with_intention', 'button_link', value)} />
            <Field label="Floating Badge Text" value={draft.crafted_with_intention.floating_badge_text} onChange={(value) => updateSection('crafted_with_intention', 'floating_badge_text', value)} />
            <div className="md:col-span-2">
              <MediaField
                label="Image URL"
                value={draft.crafted_with_intention.image}
                onChange={(value) => updateSection('crafted_with_intention', 'image', value)}
                folder="homepage/story"
                cropAspect={4 / 5}
                cropTitle="Crop Our Story Image"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Paragraphs</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => addParagraph('crafted_with_intention')}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Paragraph
            </Button>
          </div>
          {draft.crafted_with_intention.paragraphs.map((paragraph, index) => (
            <CardPanel key={`intention-paragraph-${index}`} label={`Paragraph ${index + 1}`} onRemove={() => removeParagraph('crafted_with_intention', index)}>
              <TextField label="Text" value={paragraph} onChange={(value) => updateParagraph('crafted_with_intention', index, value)} rows={4} />
            </CardPanel>
          ))}
          <Toggle label="Active" checked={draft.crafted_with_intention.is_active} onChange={(value) => updateSection('crafted_with_intention', 'is_active', value)} />
        </SectionPanel>
      ) : null}

      {activeSection === 'bestsellers' ? (
        <SectionPanel title="Bestsellers" description="Products remain controlled by the bestseller product flag.">
          <SectionHeadingPreview
            section={draft.bestsellers}
            note="Products come from Bestseller toggle."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.bestsellers.eyebrow} onChange={(value) => updateSection('bestsellers', 'eyebrow', value)} />
            <Field label="Heading" value={draft.bestsellers.heading} onChange={(value) => updateSection('bestsellers', 'heading', value)} required />
            <Field label="View All Label" value={draft.bestsellers.view_all_label} onChange={(value) => updateSection('bestsellers', 'view_all_label', value)} />
            <Field label="View All Link" value={draft.bestsellers.view_all_link} onChange={(value) => updateSection('bestsellers', 'view_all_link', value)} />
          </div>
          <Toggle label="Active" checked={draft.bestsellers.is_active} onChange={(value) => updateSection('bestsellers', 'is_active', value)} />
        </SectionPanel>
      ) : null}

      {activeSection === 'supporting_artisans' ? (
        <SectionPanel title="Supporting Our Artisans">
          <StoryPreview section={draft.supporting_artisans} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.supporting_artisans.eyebrow} onChange={(value) => updateSection('supporting_artisans', 'eyebrow', value)} />
            <Field label="Heading" value={draft.supporting_artisans.heading} onChange={(value) => updateSection('supporting_artisans', 'heading', value)} required />
            <div className="md:col-span-2">
              <MediaField
                label="Image URL"
                value={draft.supporting_artisans.image}
                onChange={(value) => updateSection('supporting_artisans', 'image', value)}
                folder="homepage/artisans"
                cropAspect={4 / 5}
                cropTitle="Crop Supporting Artisans Image"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Paragraphs</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => addParagraph('supporting_artisans')}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Paragraph
            </Button>
          </div>
          {draft.supporting_artisans.paragraphs.map((paragraph, index) => (
            <CardPanel key={`artisan-paragraph-${index}`} label={`Paragraph ${index + 1}`} onRemove={() => removeParagraph('supporting_artisans', index)}>
              <TextField label="Text" value={paragraph} onChange={(value) => updateParagraph('supporting_artisans', index, value)} rows={4} />
            </CardPanel>
          ))}
          <Toggle label="Active" checked={draft.supporting_artisans.is_active} onChange={(value) => updateSection('supporting_artisans', 'is_active', value)} />
        </SectionPanel>
      ) : null}

      {activeSection === 'craft_process' ? (
        <SectionPanel title="Our Craft Process">
          <CraftProcessPreview section={draft.craft_process} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.craft_process.eyebrow} onChange={(value) => updateSection('craft_process', 'eyebrow', value)} />
            <Field label="Heading" value={draft.craft_process.heading} onChange={(value) => updateSection('craft_process', 'heading', value)} required />
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Cards</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => addCard('craft_process', createProcessCard)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Card
            </Button>
          </div>
          <div className="space-y-4">
            {draft.craft_process.cards.map((card, index) => (
              <CardPanel key={card.id} label={`Card ${index + 1}`} onRemove={() => removeCard('craft_process', index)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Title" value={card.title} onChange={(value) => updateListItem('craft_process', index, 'title', value)} />
                  <MediaField
                    label="Image URL"
                    value={card.image}
                    onChange={(value) => updateListItem('craft_process', index, 'image', value)}
                    folder="homepage/craft-process/images"
                  />
                  <MediaField
                    label="Video URL (optional)"
                    value={card.video}
                    onChange={(value) => updateListItem('craft_process', index, 'video', value)}
                    folder="homepage/craft-process/videos"
                    mediaType="video"
                  />
                  <Field label="Link (optional)" value={card.link} onChange={(value) => updateListItem('craft_process', index, 'link', value)} />
                  <div className="md:col-span-2">
                    <TextField label="Description" value={card.description} onChange={(value) => updateListItem('craft_process', index, 'description', value)} />
                  </div>
                  <Field label="Sort Order" type="number" value={card.sort_order} onChange={(value) => updateListItem('craft_process', index, 'sort_order', value)} />
                </div>
                <div className="flex flex-wrap gap-5">
                  <Toggle label="Show Play Icon" checked={card.show_play_icon} onChange={(value) => updateListItem('craft_process', index, 'show_play_icon', value)} />
                  <Toggle label="Active" checked={card.is_active} onChange={(value) => updateListItem('craft_process', index, 'is_active', value)} />
                </div>
              </CardPanel>
            ))}
          </div>
        </SectionPanel>
      ) : null}

      {activeSection === 'faq_section' ? (
        <SectionPanel title="FAQ Section" description="FAQ items continue to be managed in the FAQs admin page.">
          <SectionHeadingPreview
            section={draft.faq_section}
            note="FAQ items come from FAQ admin."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.faq_section.eyebrow} onChange={(value) => updateSection('faq_section', 'eyebrow', value)} />
            <Field label="Heading" value={draft.faq_section.heading} onChange={(value) => updateSection('faq_section', 'heading', value)} required />
            <div className="md:col-span-2">
              <TextField label="Subheading" value={draft.faq_section.subheading} onChange={(value) => updateSection('faq_section', 'subheading', value)} />
            </div>
            <Field label="View All Label" value={draft.faq_section.view_all_label} onChange={(value) => updateSection('faq_section', 'view_all_label', value)} />
            <Field label="View All Link" value={draft.faq_section.view_all_link} onChange={(value) => updateSection('faq_section', 'view_all_link', value)} />
          </div>
          <Toggle label="Active" checked={draft.faq_section.is_active} onChange={(value) => updateSection('faq_section', 'is_active', value)} />
        </SectionPanel>
      ) : null}

      {activeSection === 'reviews_section' ? (
        <SectionPanel title="Reviews Section" description="Review items remain approved feedback plus existing fallback reviews.">
          <ReviewsPreview section={draft.reviews_section} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.reviews_section.eyebrow} onChange={(value) => updateSection('reviews_section', 'eyebrow', value)} />
            <Field label="Heading" value={draft.reviews_section.heading} onChange={(value) => updateSection('reviews_section', 'heading', value)} required />
          </div>
          <div className="flex flex-wrap gap-5">
            <Toggle label="Auto-scroll Enabled" checked={draft.reviews_section.auto_scroll_enabled} onChange={(value) => updateSection('reviews_section', 'auto_scroll_enabled', value)} />
            <Toggle label="Active" checked={draft.reviews_section.is_active} onChange={(value) => updateSection('reviews_section', 'is_active', value)} />
          </div>
        </SectionPanel>
      ) : null}

      {activeSection === 'follow_journey' ? (
        <SectionPanel title="Follow Our Journey">
          <JourneyPreview section={draft.follow_journey} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow" value={draft.follow_journey.eyebrow} onChange={(value) => updateSection('follow_journey', 'eyebrow', value)} />
            <Field label="Heading" value={draft.follow_journey.heading} onChange={(value) => updateSection('follow_journey', 'heading', value)} required />
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Image Cards</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => addCard('follow_journey', createJourneyCard)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Card
            </Button>
          </div>
          <div className="space-y-4">
            {draft.follow_journey.cards.map((card, index) => (
              <CardPanel key={card.id} label={`Card ${index + 1}`} onRemove={() => removeCard('follow_journey', index)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <MediaField
                    label="Image URL"
                    value={card.image}
                    onChange={(value) => updateListItem('follow_journey', index, 'image', value)}
                    folder="homepage/journey"
                  />
                  <Field label="Alt Text" value={card.alt_text} onChange={(value) => updateListItem('follow_journey', index, 'alt_text', value)} />
                  <Field label="Link (optional)" value={card.link} onChange={(value) => updateListItem('follow_journey', index, 'link', value)} />
                  <Field label="Sort Order" type="number" value={card.sort_order} onChange={(value) => updateListItem('follow_journey', index, 'sort_order', value)} />
                </div>
                <Toggle label="Active" checked={card.is_active} onChange={(value) => updateListItem('follow_journey', index, 'is_active', value)} />
              </CardPanel>
            ))}
          </div>
        </SectionPanel>
      ) : null}

      {activeSection === 'newsletter' ? (
        <SectionPanel title="Newsletter">
          <NewsletterPreview section={draft.newsletter} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Heading" value={draft.newsletter.heading} onChange={(value) => updateSection('newsletter', 'heading', value)} required />
            <Field label="Input Placeholder" value={draft.newsletter.input_placeholder} onChange={(value) => updateSection('newsletter', 'input_placeholder', value)} />
            <div className="md:col-span-2">
              <TextField label="Subheading" value={draft.newsletter.subheading} onChange={(value) => updateSection('newsletter', 'subheading', value)} />
            </div>
            <Field label="Button Label" value={draft.newsletter.button_label} onChange={(value) => updateSection('newsletter', 'button_label', value)} />
          </div>
          <Toggle label="Active" checked={draft.newsletter.is_active} onChange={(value) => updateSection('newsletter', 'is_active', value)} />
        </SectionPanel>
      ) : null}
    </form>
  );
};

export default AdminHomePage;
