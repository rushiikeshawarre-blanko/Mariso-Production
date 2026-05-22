import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  MessageSquareText,
  Pencil,
  Plus,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createAdminFeedbackQuestion,
  createAdminFeedbackRewardRule,
  deleteAdminFeedbackQuestion,
  deleteAdminFeedbackRewardRule,
  getAdminFeedbackQuestions,
  getAdminFeedbackRewardRules,
  getAdminFeedbackSubmissions,
  updateAdminFeedbackQuestion,
  updateAdminFeedbackRewardRule,
  updateAdminFeedbackSubmissionHomepage,
} from '../../lib/api';
import { formatINR } from '../../lib/currency';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Textarea } from '../../components/ui/textarea';

const QUESTION_TYPES = [
  { value: 'rating', label: 'Rating' },
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'choice', label: 'Choice' },
  { value: 'yes_no', label: 'Yes / No' },
];

const initialQuestionForm = {
  question: '',
  question_type: 'textarea',
  options_text: '',
  sort_order: 0,
  is_required: false,
  is_active: true,
};

const initialRuleForm = {
  name: '',
  min_order_amount: 0,
  max_order_amount: '',
  discount_type: 'percentage',
  discount_value: '',
  max_discount_amount: '',
  minimum_order_amount: '',
  validity_days: 30,
  priority: 0,
  is_active: true,
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  return Number(value);
};

const getUiQuestionType = (type) => (type === 'single_choice' || type === 'multiple_choice' ? 'choice' : type || 'textarea');

const getApiQuestionType = (type) => (type === 'choice' ? 'single_choice' : type);

const getDiscountLabel = (rule) => {
  if (rule.discount_type === 'percentage') {
    return `${rule.discount_value}%${rule.max_discount_amount ? ` up to ${formatINR(rule.max_discount_amount)}` : ''}`;
  }
  return `${formatINR(rule.discount_value)} off`;
};

const getReviewStatusClass = (status) => {
  if (status === 'approved') return 'bg-green-100 text-green-800';
  if (status === 'hidden') return 'bg-gray-100 text-gray-700';
  return 'bg-amber-100 text-amber-900';
};

const formatAnswer = (answer) => {
  if (Array.isArray(answer)) return answer.join(', ');
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  if (answer === null || answer === undefined || answer === '') return '-';
  return String(answer);
};

const AdminFeedback = () => {
  const [activeTab, setActiveTab] = useState('questions');
  const [questions, setQuestions] = useState([]);
  const [rewardRules, setRewardRules] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [updatingSubmissionId, setUpdatingSubmissionId] = useState('');
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [questionForm, setQuestionForm] = useState(initialQuestionForm);
  const [ruleForm, setRuleForm] = useState(initialRuleForm);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [questionData, ruleData, submissionData] = await Promise.all([
        getAdminFeedbackQuestions(),
        getAdminFeedbackRewardRules(),
        getAdminFeedbackSubmissions(),
      ]);
      setQuestions(questionData || []);
      setRewardRules(ruleData || []);
      setSubmissions(submissionData || []);
    } catch (fetchError) {
      console.error('Error loading feedback admin data:', fetchError);
      setError('Failed to load feedback data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const sortedQuestions = useMemo(() => (
    [...questions].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  ), [questions]);

  const sortedRules = useMemo(() => (
    [...rewardRules].sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0) || Number(a.min_order_amount || 0) - Number(b.min_order_amount || 0))
  ), [rewardRules]);

  const resetQuestionForm = () => {
    setEditingQuestion(null);
    setQuestionForm(initialQuestionForm);
  };

  const resetRuleForm = () => {
    setEditingRule(null);
    setRuleForm(initialRuleForm);
  };

  const openCreateQuestion = () => {
    resetQuestionForm();
    setQuestionDialogOpen(true);
  };

  const openEditQuestion = (question) => {
    setEditingQuestion(question);
    setQuestionForm({
      question: question.question || '',
      question_type: getUiQuestionType(question.question_type),
      options_text: (question.options || []).join(', '),
      sort_order: question.sort_order ?? 0,
      is_required: question.is_required === true,
      is_active: question.is_active !== false,
    });
    setQuestionDialogOpen(true);
  };

  const openCreateRule = () => {
    resetRuleForm();
    setRuleDialogOpen(true);
  };

  const openEditRule = (rule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name || '',
      min_order_amount: rule.min_order_amount ?? 0,
      max_order_amount: rule.max_order_amount ?? '',
      discount_type: rule.discount_type || 'percentage',
      discount_value: rule.discount_value ?? '',
      max_discount_amount: rule.max_discount_amount ?? '',
      minimum_order_amount: rule.coupon_minimum_order_amount ?? '',
      validity_days: rule.validity_days ?? 30,
      priority: rule.priority ?? 0,
      is_active: rule.is_active !== false,
    });
    setRuleDialogOpen(true);
  };

  const handleQuestionChange = (event) => {
    const { name, value, type, checked } = event.target;
    setQuestionForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleRuleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setRuleForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'discount_type' && value === 'fixed' ? { max_discount_amount: '' } : {}),
    }));
  };

  const buildQuestionPayload = () => {
    const options = questionForm.question_type === 'choice'
      ? questionForm.options_text.split(',').map((option) => option.trim()).filter(Boolean)
      : [];

    return {
      question: questionForm.question.trim(),
      question_type: getApiQuestionType(questionForm.question_type),
      options,
      sort_order: Number(questionForm.sort_order || 0),
      is_required: questionForm.is_required,
      is_active: questionForm.is_active,
    };
  };

  const buildRulePayload = () => ({
    name: ruleForm.name.trim(),
    min_order_amount: Number(ruleForm.min_order_amount || 0),
    max_order_amount: toNullableNumber(ruleForm.max_order_amount),
    discount_type: ruleForm.discount_type,
    discount_value: Number(ruleForm.discount_value),
    max_discount_amount: ruleForm.discount_type === 'percentage' ? toNullableNumber(ruleForm.max_discount_amount) : null,
    coupon_minimum_order_amount: Number(ruleForm.minimum_order_amount || 0),
    validity_days: Number(ruleForm.validity_days || 30),
    priority: Number(ruleForm.priority || 0),
    is_active: ruleForm.is_active,
  });

  const handleQuestionSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const payload = buildQuestionPayload();
    if (!payload.question) {
      setError('Question text is required.');
      return;
    }
    if (questionForm.question_type === 'choice' && payload.options.length === 0) {
      setError('Choice questions need at least one option.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingQuestion) {
        await updateAdminFeedbackQuestion(editingQuestion.id, payload);
        toast.success('Question updated');
      } else {
        await createAdminFeedbackQuestion(payload);
        toast.success('Question created');
      }
      await fetchData();
      setQuestionDialogOpen(false);
      resetQuestionForm();
    } catch (saveError) {
      console.error('Error saving feedback question:', saveError);
      setError(saveError?.response?.data?.detail || 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  };

  const handleRuleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const payload = buildRulePayload();
    if (!payload.name) {
      setError('Rule name is required.');
      return;
    }
    if (!payload.discount_value || payload.discount_value <= 0) {
      setError('Discount value must be greater than 0.');
      return;
    }
    if (payload.discount_type === 'percentage' && payload.discount_value > 100) {
      setError('Percentage discount must be 100 or less.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingRule) {
        await updateAdminFeedbackRewardRule(editingRule.id, payload);
        toast.success('Reward rule updated');
      } else {
        await createAdminFeedbackRewardRule(payload);
        toast.success('Reward rule created');
      }
      await fetchData();
      setRuleDialogOpen(false);
      resetRuleForm();
    } catch (saveError) {
      console.error('Error saving feedback reward rule:', saveError);
      setError(saveError?.response?.data?.detail || 'Failed to save reward rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (question) => {
    if (!window.confirm(`Delete question: ${question.question}?`)) return;
    try {
      await deleteAdminFeedbackQuestion(question.id);
      toast.success('Question deleted');
      await fetchData();
    } catch (deleteError) {
      console.error('Error deleting feedback question:', deleteError);
      toast.error(deleteError?.response?.data?.detail || 'Failed to delete question.');
    }
  };

  const handleDeleteRule = async (rule) => {
    if (!window.confirm(`Delete reward rule: ${rule.name}?`)) return;
    try {
      await deleteAdminFeedbackRewardRule(rule.id);
      toast.success('Reward rule deleted');
      await fetchData();
    } catch (deleteError) {
      console.error('Error deleting feedback reward rule:', deleteError);
      toast.error(deleteError?.response?.data?.detail || 'Failed to delete reward rule.');
    }
  };

  const patchSubmission = async (submission, payload, successMessage) => {
    if (updatingSubmissionId) return;
    setUpdatingSubmissionId(submission.id);
    try {
      await updateAdminFeedbackSubmissionHomepage(submission.id, payload);
      toast.success(successMessage);
      await fetchData();
    } catch (updateError) {
      console.error('Error updating feedback submission:', updateError);
      toast.error(updateError?.response?.data?.detail || 'Failed to update review.');
    } finally {
      setUpdatingSubmissionId('');
    }
  };

  const tabs = [
    { id: 'questions', label: 'Questions', count: questions.length },
    { id: 'rules', label: 'Reward Rules', count: rewardRules.length },
    { id: 'reviews', label: 'Reviews', count: submissions.length },
  ];

  return (
    <div className="space-y-6" data-testid="admin-feedback-page">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-heading text-3xl">Feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage post-delivery questions, reward rules, and homepage review visibility.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-2 card-shadow">
        <div className="grid gap-2 sm:grid-cols-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-foreground text-primary-foreground'
                  : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
              <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {activeTab === 'questions' ? (
        <section className="rounded-xl bg-white p-6 card-shadow">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-heading text-xl">Questions</h2>
              <p className="text-sm text-muted-foreground">Active questions appear on the public feedback form.</p>
            </div>
            <Button onClick={openCreateQuestion} className="btn-primary w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Question
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[920px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead>Sort</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center">Loading questions...</TableCell></TableRow>
                ) : sortedQuestions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No feedback questions yet.</TableCell></TableRow>
                ) : sortedQuestions.map((question) => (
                  <TableRow key={question.id}>
                    <TableCell className="max-w-[320px] font-medium">{question.question}</TableCell>
                    <TableCell>{QUESTION_TYPES.find((type) => type.value === getUiQuestionType(question.question_type))?.label || question.question_type}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">
                      {(question.options || []).join(', ') || '-'}
                    </TableCell>
                    <TableCell>{question.sort_order ?? 0}</TableCell>
                    <TableCell>{question.is_required ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${question.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                        {question.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditQuestion(question)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteQuestion(question)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {activeTab === 'rules' ? (
        <section className="rounded-xl bg-white p-6 card-shadow">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-heading text-xl">Reward Rules</h2>
              <p className="text-sm text-muted-foreground">Rules match delivered order amount and create personal private coupons.</p>
            </div>
            <Button onClick={openCreateRule} className="btn-primary w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Order Amount</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Next Min</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Rule Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center">Loading reward rules...</TableCell></TableRow>
                ) : sortedRules.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No reward rules yet.</TableCell></TableRow>
                ) : sortedRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      {formatINR(rule.min_order_amount)}
                      {' - '}
                      {rule.max_order_amount ? formatINR(rule.max_order_amount) : 'No cap'}
                    </TableCell>
                    <TableCell>{getDiscountLabel(rule)}</TableCell>
                    <TableCell>{formatINR(rule.coupon_minimum_order_amount || 0)}</TableCell>
                    <TableCell>{rule.validity_days} days</TableCell>
                    <TableCell>{rule.priority ?? 0}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditRule(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteRule(rule)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {activeTab === 'reviews' ? (
        <section className="rounded-xl bg-white p-6 card-shadow">
          <div className="mb-5">
            <h2 className="font-heading text-xl">Reviews</h2>
            <p className="text-sm text-muted-foreground">Review text is displayed as plain text and can be approved or hidden for homepage use.</p>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Coupon</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Homepage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center">Loading reviews...</TableCell></TableRow>
                ) : submissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <MessageSquareText className="h-8 w-8 text-muted-foreground/60" />
                        <span>No feedback submissions yet.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-mono text-sm">#{submission.order_number || String(submission.order_id || '').slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-[#C98E74]" fill="currentColor" strokeWidth={1.5} />
                        <span className="font-medium">{submission.rating || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[360px]">
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {submission.review_text || '-'}
                      </p>
                      {submission.answers?.length ? (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-medium text-foreground/60">Answers</summary>
                          <div className="mt-2 space-y-1.5">
                            {submission.answers.map((answer, index) => (
                              <p key={`${answer.question_id}-${index}`}>
                                <span className="font-medium">{answer.question || answer.question_id}:</span> {formatAnswer(answer.answer)}
                              </p>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{submission.reward_coupon_code || '-'}</TableCell>
                    <TableCell>{formatDate(submission.created_at)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getReviewStatusClass(submission.homepage_status)}`}>
                          {submission.homepage_status || 'pending'}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {submission.show_on_homepage ? 'Shown on homepage' : 'Hidden from homepage'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updatingSubmissionId === submission.id}
                          onClick={() => patchSubmission(submission, { homepage_status: 'approved', show_on_homepage: true }, 'Review approved')}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4 text-green-700" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updatingSubmissionId === submission.id}
                          onClick={() => patchSubmission(submission, { homepage_status: 'hidden', show_on_homepage: false }, 'Review rejected')}
                        >
                          <XCircle className="mr-1 h-4 w-4 text-destructive" />
                          Reject
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updatingSubmissionId === submission.id}
                          onClick={() => patchSubmission(
                            submission,
                            submission.show_on_homepage
                              ? { show_on_homepage: false, homepage_status: 'hidden' }
                              : { show_on_homepage: true, homepage_status: 'approved' },
                            submission.show_on_homepage ? 'Review hidden' : 'Review shown'
                          )}
                        >
                          {submission.show_on_homepage ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                          {submission.show_on_homepage ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <Dialog open={questionDialogOpen} onOpenChange={(open) => {
        setQuestionDialogOpen(open);
        if (!open) resetQuestionForm();
      }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {editingQuestion ? 'Edit Question' : 'Create Question'}
            </DialogTitle>
            <DialogDescription>
              Questions are shown on delivered order feedback links.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleQuestionSubmit}>
            <div>
              <Label htmlFor="question">Question</Label>
              <Textarea
                id="question"
                name="question"
                value={questionForm.question}
                onChange={handleQuestionChange}
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="question_type">Type</Label>
                <select
                  id="question_type"
                  name="question_type"
                  value={questionForm.question_type}
                  onChange={handleQuestionChange}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {QUESTION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  name="sort_order"
                  type="number"
                  value={questionForm.sort_order}
                  onChange={handleQuestionChange}
                  className="mt-1"
                />
              </div>
            </div>

            {questionForm.question_type === 'choice' ? (
              <div>
                <Label htmlFor="options_text">Options</Label>
                <Input
                  id="options_text"
                  name="options_text"
                  value={questionForm.options_text}
                  onChange={handleQuestionChange}
                  placeholder="Quality, Packaging, Fragrance"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted-foreground">Separate options with commas.</p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="is_required" checked={questionForm.is_required} onChange={handleQuestionChange} />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="is_active" checked={questionForm.is_active} onChange={handleQuestionChange} />
                Active
              </label>
            </div>

            <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setQuestionDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingQuestion ? 'Update Question' : 'Create Question'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={ruleDialogOpen} onOpenChange={(open) => {
        setRuleDialogOpen(open);
        if (!open) resetRuleForm();
      }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {editingRule ? 'Edit Reward Rule' : 'Create Reward Rule'}
            </DialogTitle>
            <DialogDescription>
              The first matching rule creates a private personal coupon. Rule order 1 is checked first.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleRuleSubmit}>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" value={ruleForm.name} onChange={handleRuleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="priority">Rule Order</Label>
                <Input id="priority" name="priority" type="number" value={ruleForm.priority} onChange={handleRuleChange} className="mt-1" />
                <p className="mt-1 text-xs text-muted-foreground">1 is checked first.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="min_order_amount">Minimum Delivered Order Amount</Label>
                <Input id="min_order_amount" name="min_order_amount" type="number" min="0" step="0.01" value={ruleForm.min_order_amount} onChange={handleRuleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="max_order_amount">Maximum Delivered Order Amount</Label>
                <Input id="max_order_amount" name="max_order_amount" type="number" min="0" step="0.01" value={ruleForm.max_order_amount} onChange={handleRuleChange} placeholder="Optional" className="mt-1" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <Label htmlFor="discount_type">Discount Type</Label>
                <select id="discount_type" name="discount_type" value={ruleForm.discount_type} onChange={handleRuleChange} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
              <div>
                <Label htmlFor="discount_value">Discount Value</Label>
                <Input id="discount_value" name="discount_value" type="number" min="0" step="0.01" value={ruleForm.discount_value} onChange={handleRuleChange} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="max_discount_amount">Max Discount</Label>
                <Input id="max_discount_amount" name="max_discount_amount" type="number" min="0" step="0.01" value={ruleForm.max_discount_amount} onChange={handleRuleChange} disabled={ruleForm.discount_type === 'fixed'} placeholder="Optional" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="validity_days">Validity Days</Label>
                <Input id="validity_days" name="validity_days" type="number" min="1" value={ruleForm.validity_days} onChange={handleRuleChange} className="mt-1" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="minimum_order_amount">Minimum Order Amount for Next Purchase</Label>
                <Input id="minimum_order_amount" name="minimum_order_amount" type="number" min="0" step="0.01" value={ruleForm.minimum_order_amount} onChange={handleRuleChange} placeholder="Optional" className="mt-1" />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium sm:self-end">
                <input type="checkbox" name="is_active" checked={ruleForm.is_active} onChange={handleRuleChange} />
                Active
              </label>
            </div>

            <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminFeedback;
