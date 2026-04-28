from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator


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