import re
import uuid
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


class ContentPageBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    slug: str = Field(..., min_length=1, max_length=160)
    footer_label: str = Field(..., min_length=1, max_length=80)
    content: str = Field(..., min_length=1)
    is_active: bool = True
    show_in_footer: bool = True
    sort_order: int = 0
    external_url: Optional[str] = None

    
    @field_validator("external_url")
    @classmethod
    def validate_external_url(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            return None
        if not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("external_url must start with http:// or https://")
        return value


class ContentPageCreate(ContentPageBase):
    pass


class ContentPageUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    slug: Optional[str] = Field(None, min_length=1, max_length=160)
    footer_label: Optional[str] = Field(None, min_length=1, max_length=80)
    content: Optional[str] = Field(None, min_length=1)
    is_active: Optional[bool] = None
    show_in_footer: Optional[bool] = None
    sort_order: Optional[int] = None
    external_url: Optional[str] = None

    @field_validator("external_url")
    @classmethod
    def validate_external_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            return None
        if not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError("external_url must start with http:// or https://")
        return value


class ContentPageResponse(ContentPageBase):
    id: str
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


class FAQBase(BaseModel):
    question: str = Field(..., min_length=1, max_length=300)
    answer: str = Field(..., min_length=1)
    is_active: bool = True
    show_on_homepage: bool = False
    sort_order: int = 0


class FAQCreate(FAQBase):
    pass


class FAQUpdate(BaseModel):
    question: Optional[str] = Field(None, min_length=1, max_length=300)
    answer: Optional[str] = Field(None, min_length=1)
    is_active: Optional[bool] = None
    show_on_homepage: Optional[bool] = None
    sort_order: Optional[int] = None


class FAQResponse(FAQBase):
    id: str
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


def validate_homepage_link(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    if normalized.startswith("/") and not normalized.startswith("//"):
        return normalized
    if normalized.startswith("#"):
        return normalized
    if normalized.startswith("http://") or normalized.startswith("https://"):
        return normalized

    raise ValueError("link must be an internal path, fragment, or start with http:// or https://")


def validate_required_homepage_link(value: str) -> str:
    normalized = validate_homepage_link(value)
    if normalized is None:
        raise ValueError("link is required")
    return normalized


def clamp_homepage_hero_overlay_opacity(value: Optional[int]) -> int:
    try:
        numeric_value = int(value)
    except (TypeError, ValueError):
        return 55
    return min(max(numeric_value, 0), 80)


def validate_homepage_hex_color(value: Optional[str], fallback: str) -> str:
    normalized = (value or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", normalized):
        return normalized.upper()
    return fallback


def normalize_item_id(value: Optional[str]) -> str:
    normalized = (value or "").strip()
    return normalized or str(uuid.uuid4())


class HomepageHeroButton(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str = Field(..., min_length=1, max_length=80)
    link: str = Field(..., min_length=1, max_length=500)
    style: Literal["primary", "secondary"] = "primary"
    is_active: bool = True
    sort_order: int = 0

    @field_validator("id", mode="before")
    @classmethod
    def validate_id(cls, value: Optional[str]) -> str:
        return normalize_item_id(value)

    @field_validator("link")
    @classmethod
    def validate_link(cls, value: str) -> str:
        return validate_required_homepage_link(value)


class HomepageAnnouncementSettings(BaseModel):
    announcement_enabled: bool = True
    announcement_text: str = Field(
        "Use code MARISO10 for 10% off on selected candles",
        max_length=180,
    )
    announcement_link: Optional[str] = Field(None, max_length=500)
    announcement_bg_color: str = Field("#8A6F55", max_length=20)
    announcement_text_color: str = Field("#FFFFFF", max_length=20)

    @field_validator("announcement_link")
    @classmethod
    def validate_announcement_link(cls, value: Optional[str]) -> Optional[str]:
        return validate_homepage_link(value)

    @field_validator("announcement_bg_color", mode="before")
    @classmethod
    def validate_announcement_bg_color(cls, value: Optional[str]) -> str:
        return validate_homepage_hex_color(value, "#8A6F55")

    @field_validator("announcement_text_color", mode="before")
    @classmethod
    def validate_announcement_text_color(cls, value: Optional[str]) -> str:
        return validate_homepage_hex_color(value, "#FFFFFF")


class HomepageHeroSettings(BaseModel):
    eyebrow: str = Field(..., max_length=120)
    heading: str = Field(..., min_length=1, max_length=240)
    subheading: str = Field(..., max_length=300)
    background_image: str = Field(..., max_length=1000)
    hero_overlay_opacity: int = Field(55, ge=0, le=80)
    hero_eyebrow_color: str = Field("#5F554F", max_length=20)
    hero_title_color: str = Field("#1C1917", max_length=20)
    hero_subtitle_color: str = Field("#4A403A", max_length=20)
    buttons: List[HomepageHeroButton] = Field(default_factory=list)

    @field_validator("hero_overlay_opacity", mode="before")
    @classmethod
    def validate_hero_overlay_opacity(cls, value: Optional[int]) -> int:
        return clamp_homepage_hero_overlay_opacity(value)

    @field_validator("hero_eyebrow_color", mode="before")
    @classmethod
    def validate_hero_eyebrow_color(cls, value: Optional[str]) -> str:
        return validate_homepage_hex_color(value, "#5F554F")

    @field_validator("hero_title_color", mode="before")
    @classmethod
    def validate_hero_title_color(cls, value: Optional[str]) -> str:
        return validate_homepage_hex_color(value, "#1C1917")

    @field_validator("hero_subtitle_color", mode="before")
    @classmethod
    def validate_hero_subtitle_color(cls, value: Optional[str]) -> str:
        return validate_homepage_hex_color(value, "#4A403A")


class HomepageProductSectionSettings(BaseModel):
    eyebrow: str = Field(..., max_length=120)
    heading: str = Field(..., min_length=1, max_length=200)
    view_all_label: str = Field(..., max_length=80)
    view_all_link: Optional[str] = Field(None, max_length=500)
    is_active: bool = True

    @field_validator("view_all_link")
    @classmethod
    def validate_view_all_link(cls, value: Optional[str]) -> Optional[str]:
        return validate_homepage_link(value)


class HomepageCategoryCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(..., min_length=1, max_length=120)
    subtitle: str = Field(..., max_length=250)
    image: str = Field(..., max_length=1000)
    link: Optional[str] = Field(None, max_length=500)
    category_id: Optional[str] = Field(None, max_length=100)
    is_active: bool = True
    sort_order: int = 0

    @field_validator("id", mode="before")
    @classmethod
    def validate_id(cls, value: Optional[str]) -> str:
        return normalize_item_id(value)

    @field_validator("link")
    @classmethod
    def validate_link(cls, value: Optional[str]) -> Optional[str]:
        return validate_homepage_link(value)


HOMEPAGE_CATEGORY_TEMPLATES = {
    2: {"split", "feature-side"},
    3: {"feature-two", "equal-three"},
    4: {"grid-four", "feature-three"},
    5: {"feature-four"},
    6: {"grid-six", "feature-five"},
}


class HomepageCategorySectionSettings(BaseModel):
    eyebrow: str = Field(..., max_length=120)
    heading: str = Field(..., min_length=1, max_length=200)
    card_count: int = Field(..., ge=2, le=6)
    template: str = Field(..., min_length=1, max_length=40)
    cards: List[HomepageCategoryCard] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def validate_template_for_card_count(self):
        if self.template not in HOMEPAGE_CATEGORY_TEMPLATES[self.card_count]:
            allowed = ", ".join(sorted(HOMEPAGE_CATEGORY_TEMPLATES[self.card_count]))
            raise ValueError(f"template must be one of {allowed} when card_count is {self.card_count}")
        return self


class HomepageStorySectionSettings(BaseModel):
    eyebrow: str = Field(..., max_length=120)
    heading: str = Field(..., min_length=1, max_length=200)
    paragraphs: List[str] = Field(default_factory=list)
    button_label: str = Field(..., max_length=80)
    button_link: Optional[str] = Field(None, max_length=500)
    image: str = Field(..., max_length=1000)
    floating_badge_text: str = Field(..., max_length=120)
    is_active: bool = True

    @field_validator("button_link")
    @classmethod
    def validate_button_link(cls, value: Optional[str]) -> Optional[str]:
        return validate_homepage_link(value)


class HomepageArtisansSectionSettings(BaseModel):
    eyebrow: str = Field(..., max_length=120)
    heading: str = Field(..., min_length=1, max_length=200)
    paragraphs: List[str] = Field(default_factory=list)
    image: str = Field(..., max_length=1000)
    is_active: bool = True


class HomepageCraftProcessCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = Field(..., min_length=1, max_length=120)
    description: str = Field(..., max_length=500)
    image: str = Field(..., max_length=1000)
    video: Optional[str] = Field(None, max_length=1000)
    show_play_icon: bool = False
    link: Optional[str] = Field(None, max_length=500)
    is_active: bool = True
    sort_order: int = 0

    @field_validator("id", mode="before")
    @classmethod
    def validate_id(cls, value: Optional[str]) -> str:
        return normalize_item_id(value)

    @field_validator("link")
    @classmethod
    def validate_link(cls, value: Optional[str]) -> Optional[str]:
        return validate_homepage_link(value)


class HomepageCraftProcessSettings(BaseModel):
    eyebrow: str = Field(..., max_length=120)
    heading: str = Field(..., min_length=1, max_length=200)
    cards: List[HomepageCraftProcessCard] = Field(default_factory=list)


class HomepageFaqSectionSettings(HomepageProductSectionSettings):
    subheading: str = Field(..., max_length=400)


class HomepageReviewsSectionSettings(BaseModel):
    eyebrow: str = Field(..., max_length=120)
    heading: str = Field(..., min_length=1, max_length=200)
    auto_scroll_enabled: bool = True
    is_active: bool = True


class HomepageJourneyCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    image: str = Field(..., min_length=1, max_length=1000)
    alt_text: str = Field(..., max_length=200)
    link: Optional[str] = Field(None, max_length=500)
    is_active: bool = True
    sort_order: int = 0

    @field_validator("id", mode="before")
    @classmethod
    def validate_id(cls, value: Optional[str]) -> str:
        return normalize_item_id(value)

    @field_validator("link")
    @classmethod
    def validate_link(cls, value: Optional[str]) -> Optional[str]:
        return validate_homepage_link(value)


class HomepageJourneySettings(BaseModel):
    eyebrow: str = Field(..., max_length=120)
    heading: str = Field(..., min_length=1, max_length=200)
    cards: List[HomepageJourneyCard] = Field(default_factory=list)


class HomepageNewsletterSettings(BaseModel):
    heading: str = Field(..., min_length=1, max_length=200)
    subheading: str = Field(..., max_length=400)
    input_placeholder: str = Field(..., max_length=120)
    button_label: str = Field(..., max_length=80)
    is_active: bool = True


class HomepageSettingsPayload(BaseModel):
    announcement: HomepageAnnouncementSettings = Field(default_factory=HomepageAnnouncementSettings)
    hero: HomepageHeroSettings
    featured_collection: HomepageProductSectionSettings
    shop_by_category: HomepageCategorySectionSettings
    crafted_with_intention: HomepageStorySectionSettings
    bestsellers: HomepageProductSectionSettings
    supporting_artisans: HomepageArtisansSectionSettings
    craft_process: HomepageCraftProcessSettings
    faq_section: HomepageFaqSectionSettings
    reviews_section: HomepageReviewsSectionSettings
    follow_journey: HomepageJourneySettings
    newsletter: HomepageNewsletterSettings


class HomepageSettingsResponse(HomepageSettingsPayload):
    id: str
    key: Literal["home"]
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)
