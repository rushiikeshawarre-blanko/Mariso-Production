from typing import List

from fastapi import APIRouter, Depends

from core.auth import get_admin_user
from models.feedback import (
    FeedbackQuestionCreate,
    FeedbackQuestionResponse,
    FeedbackQuestionUpdate,
    FeedbackRewardRuleCreate,
    FeedbackRewardRuleResponse,
    FeedbackRewardRuleUpdate,
    FeedbackSubmissionHomepageUpdate,
    FeedbackSubmitRequest,
)
from services.feedback_service import (
    create_feedback_question,
    create_feedback_reward_rule,
    delete_feedback_question,
    delete_feedback_reward_rule,
    get_public_feedback,
    list_homepage_feedback_reviews,
    list_feedback_questions,
    list_feedback_reward_rules,
    list_feedback_submissions,
    submit_public_feedback,
    update_feedback_question,
    update_feedback_reward_rule,
    update_feedback_submission_homepage_status,
)


router = APIRouter(prefix="/api", tags=["Feedback"])


@router.get("/feedback/reviews/homepage", response_model=List[dict])
async def get_homepage_feedback_reviews(limit: int = 10):
    return await list_homepage_feedback_reviews(limit)


@router.get("/feedback/{feedback_token}", response_model=dict)
async def get_feedback(feedback_token: str):
    return await get_public_feedback(feedback_token)


@router.post("/feedback/{feedback_token}/submit", response_model=dict)
async def submit_feedback(feedback_token: str, payload: FeedbackSubmitRequest):
    return await submit_public_feedback(feedback_token, payload)


@router.get("/admin/feedback/questions", response_model=List[FeedbackQuestionResponse])
async def get_admin_feedback_questions(admin: dict = Depends(get_admin_user)):
    return await list_feedback_questions()


@router.post("/admin/feedback/questions", response_model=FeedbackQuestionResponse)
async def create_admin_feedback_question(payload: FeedbackQuestionCreate, admin: dict = Depends(get_admin_user)):
    return await create_feedback_question(payload)


@router.put("/admin/feedback/questions/{question_id}", response_model=FeedbackQuestionResponse)
async def update_admin_feedback_question(
    question_id: str,
    payload: FeedbackQuestionUpdate,
    admin: dict = Depends(get_admin_user),
):
    return await update_feedback_question(question_id, payload)


@router.delete("/admin/feedback/questions/{question_id}", response_model=dict)
async def delete_admin_feedback_question(question_id: str, admin: dict = Depends(get_admin_user)):
    return await delete_feedback_question(question_id)


@router.get("/admin/feedback/reward-rules", response_model=List[FeedbackRewardRuleResponse])
async def get_admin_feedback_reward_rules(admin: dict = Depends(get_admin_user)):
    return await list_feedback_reward_rules()


@router.post("/admin/feedback/reward-rules", response_model=FeedbackRewardRuleResponse)
async def create_admin_feedback_reward_rule(payload: FeedbackRewardRuleCreate, admin: dict = Depends(get_admin_user)):
    return await create_feedback_reward_rule(payload)


@router.put("/admin/feedback/reward-rules/{rule_id}", response_model=FeedbackRewardRuleResponse)
async def update_admin_feedback_reward_rule(
    rule_id: str,
    payload: FeedbackRewardRuleUpdate,
    admin: dict = Depends(get_admin_user),
):
    return await update_feedback_reward_rule(rule_id, payload)


@router.delete("/admin/feedback/reward-rules/{rule_id}", response_model=dict)
async def delete_admin_feedback_reward_rule(rule_id: str, admin: dict = Depends(get_admin_user)):
    return await delete_feedback_reward_rule(rule_id)


@router.get("/admin/feedback/submissions", response_model=List[dict])
async def get_admin_feedback_submissions(limit: int = 1000, admin: dict = Depends(get_admin_user)):
    return await list_feedback_submissions(limit)


@router.patch("/admin/feedback/submissions/{submission_id}/homepage", response_model=dict)
async def patch_admin_feedback_submission_homepage(
    submission_id: str,
    payload: FeedbackSubmissionHomepageUpdate,
    admin: dict = Depends(get_admin_user),
):
    return await update_feedback_submission_homepage_status(submission_id, payload)
