from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from models.coupon import DiscountType


QuestionType = Literal["text", "textarea", "rating", "single_choice", "multiple_choice", "yes_no"]
ReviewHomepageStatus = Literal["pending", "approved", "hidden"]


class FeedbackQuestionBase(BaseModel):
    question: str
    question_type: QuestionType = "textarea"
    options: List[str] = Field(default_factory=list)
    sort_order: int = 0
    is_required: bool = False
    is_active: bool = True

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Question is required")
        return normalized

    @model_validator(mode="after")
    def validate_options(self):
        if self.question_type in {"single_choice", "multiple_choice"}:
            self.options = [option.strip() for option in self.options if option.strip()]
            if not self.options:
                raise ValueError("Choice questions require options")
        return self


class FeedbackQuestionCreate(FeedbackQuestionBase):
    pass


class FeedbackQuestionUpdate(BaseModel):
    question: Optional[str] = None
    question_type: Optional[QuestionType] = None
    options: Optional[List[str]] = None
    sort_order: Optional[int] = None
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("Question cannot be empty")
        return normalized


class FeedbackQuestionResponse(FeedbackQuestionBase):
    model_config = ConfigDict(extra="ignore")

    id: str
    created_at: str
    updated_at: str


class FeedbackRewardRuleBase(BaseModel):
    name: str
    min_order_amount: float = Field(0, ge=0)
    max_order_amount: Optional[float] = Field(None, ge=0)
    discount_type: DiscountType
    discount_value: float
    max_discount_amount: Optional[float] = Field(None, ge=0)
    coupon_minimum_order_amount: Optional[float] = Field(0, ge=0)
    validity_days: int = Field(30, gt=0)
    priority: int = 0
    description: Optional[str] = ""
    display_title: Optional[str] = ""
    display_description: Optional[str] = ""
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Rule name is required")
        return normalized

    @model_validator(mode="after")
    def validate_rule(self):
        if self.max_order_amount is not None and self.max_order_amount < self.min_order_amount:
            raise ValueError("max_order_amount must be greater than or equal to min_order_amount")
        if self.discount_type == "percentage":
            if self.discount_value <= 0 or self.discount_value > 100:
                raise ValueError("Percentage discount value must be between 0 and 100")
        elif self.discount_value <= 0:
            raise ValueError("Fixed discount value must be positive")
        return self


class FeedbackRewardRuleCreate(FeedbackRewardRuleBase):
    pass


class FeedbackRewardRuleUpdate(BaseModel):
    name: Optional[str] = None
    min_order_amount: Optional[float] = Field(None, ge=0)
    max_order_amount: Optional[float] = Field(None, ge=0)
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[float] = None
    max_discount_amount: Optional[float] = Field(None, ge=0)
    coupon_minimum_order_amount: Optional[float] = Field(None, ge=0)
    validity_days: Optional[int] = Field(None, gt=0)
    priority: Optional[int] = None
    description: Optional[str] = None
    display_title: Optional[str] = None
    display_description: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("Rule name cannot be empty")
        return normalized


class FeedbackRewardRuleResponse(FeedbackRewardRuleBase):
    model_config = ConfigDict(extra="ignore")

    id: str
    created_at: str
    updated_at: str


class FeedbackAnswer(BaseModel):
    question_id: str
    answer: str | List[str] | int | float | bool


class FeedbackSubmitRequest(BaseModel):
    answers: List[FeedbackAnswer] = Field(default_factory=list)
    review_text: Optional[str] = ""
    rating: Optional[int] = Field(None, ge=1, le=5)


class FeedbackSubmissionHomepageUpdate(BaseModel):
    show_on_homepage: Optional[bool] = None
    homepage_status: Optional[ReviewHomepageStatus] = None
