/**
 * ============================================================================
 * REVIEW HUB PAGE
 * ============================================================================
 * View and edit all generated content for an episode.
 * Tabbed interface for different content types.
 *
 * Features:
 * - View generated content by category (analysis, quotes, titles, blog, social, email)
 * - Edit episode title inline
 * - Edit blog post content with save functionality
 * - Delete episode with confirmation
 * - Regenerate individual stages
 * - Copy content to clipboard
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Quote,
  Type,
  AlignLeft,
  Share2,
  Mail,
  Copy,
  Check,
  AlertCircle,
  Trash2,
  ArrowLeft,
  Edit3,
  Save,
  X,
  Bookmark,
  Calendar,
  CheckCircle,
  MoreVertical,
  CalendarX,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button, Card, Spinner, Badge, ConfirmDialog, EditableText, EditableCard, useToast, EpisodeHero } from '@components/shared';
import ScheduleModal from '@components/shared/ScheduleModal';
import SaveToLibraryModal from '@components/shared/SaveToLibraryModal';
import api from '@utils/api-client';
import styles from './ReviewHub.module.css';

// Tab definitions
// Each tab shows content from specific pipeline stages:
// - Stage 1: Transcript Analysis (episode_crux, key_themes, target_audiences)
// - Stage 2: Quote Extraction (quotes array)
// - Stage 3: Blog Outline - High Level (outline array)
// - Stage 4: Paragraph Details (paragraph_details)
// - Stage 5: Headlines & Copy (headlines, subheadings, taglines, social_hooks)
// - Stage 6: Draft Generation (output_text)
// - Stage 7: Refinement Pass (output_text - final blog)
// - Stage 8: Social Content (instagram, twitter, linkedin, facebook)
// - Stage 9: Email Campaign (subject_lines, preview_text, email_body)
const TABS = [
  { id: 'analysis', label: 'Analysis', icon: FileText, stages: [1] },
  { id: 'quotes', label: 'Quotes', icon: Quote, stages: [2] },
  { id: 'titles', label: 'Titles', icon: Type, stages: [5] },
  { id: 'blog', label: 'Blog Post', icon: AlignLeft, stages: [3, 4, 6, 7] },
  { id: 'social', label: 'Social', icon: Share2, stages: [8] },
  { id: 'email', label: 'Email', icon: Mail, stages: [9] },
];

/**
 * ReviewHub page component
 */
function ReviewHub() {
  const { id: episodeId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ============================================================================
  // STATE
  // ============================================================================

  // Episode and stage data
  const [loading, setLoading] = useState(true);
  const [episode, setEpisode] = useState(null);
  const [stages, setStages] = useState([]);
  const [activeTab, setActiveTab] = useState('analysis');
  const [error, setError] = useState(null);

  // UI interaction states
  const [copied, setCopied] = useState(null);

  // Delete confirmation dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const titleInputRef = useRef(null);

  // Blog post editing state
  const [isEditingBlog, setIsEditingBlog] = useState(false);
  const [editedBlogContent, setEditedBlogContent] = useState('');
  const [savingBlog, setSavingBlog] = useState(false);

  // Save to Library modal state
  const [saveLibraryData, setSaveLibraryData] = useState(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  // Schedule modal state
  const [scheduleData, setScheduleData] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [editingCalendarItem, setEditingCalendarItem] = useState(null); // For rescheduling

  // Unschedule state
  const [unscheduling, setUnscheduling] = useState(null); // calendarItemId being unscheduled

  // Library and calendar status tracking
  const [libraryItems, setLibraryItems] = useState([]);
  const [calendarItems, setCalendarItems] = useState([]);

  // Stage content editing state - tracks which items are being saved
  const [savingStageContent, setSavingStageContent] = useState({});

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Fetch episode data on mount
  useEffect(() => {
    fetchEpisode();
  }, [episodeId]);

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  /**
   * Fetch episode and stage data from API
   */
  async function fetchEpisode() {
    try {
      setLoading(true);
      console.log('[ReviewHub] Fetching episode:', episodeId);

      const data = await api.episodes.getWithStages(episodeId);
      setEpisode(data.episode);
      setStages(data.stages || []);
      setError(null);

      console.log('[ReviewHub] Episode loaded successfully');

      // Fetch library and calendar items for this episode
      fetchContentStatus();
    } catch (err) {
      console.error('[ReviewHub] Failed to fetch episode:', err);
      setError(err.message || 'Failed to load episode');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fetch library and calendar items to show status on content
   */
  async function fetchContentStatus() {
    try {
      console.log('[ReviewHub] Fetching content status for episode:', episodeId);

      // Fetch library items for this episode
      const libraryData = await api.library.list({ episode_id: episodeId });
      setLibraryItems(libraryData.items || []);

      // Fetch calendar items for this episode
      const calendarData = await api.calendar.list({ episode_id: episodeId });
      setCalendarItems(calendarData.items || []);

      console.log('[ReviewHub] Content status loaded:', {
        libraryCount: libraryData.items?.length || 0,
        calendarCount: calendarData.items?.length || 0,
      });
    } catch (err) {
      // Non-critical error - just log it
      console.warn('[ReviewHub] Failed to fetch content status:', err);
    }
  }

  /**
   * Check if content is in library
   * @param {string} contentType - blog, social, email
   * @param {string|null} platform - Platform for social content
   * @param {string} content - The content text to match
   * @returns {Object|null} Library item if found, null otherwise
   */
  function getLibraryStatus(contentType, platform, content) {
    return libraryItems.find(item =>
      item.content_type === contentType &&
      item.platform === platform &&
      item.content === content
    ) || null;
  }

  /**
   * Check if content is scheduled
   * @param {string} contentType - blog, social, email
   * @param {string|null} platform - Platform for social content
   * @param {string} content - The content text to match
   * @returns {Object|null} Calendar item if found, null otherwise
   */
  function getCalendarStatus(contentType, platform, content) {
    return calendarItems.find(item =>
      item.content_type === contentType &&
      item.platform === platform &&
      item.full_content === content
    ) || null;
  }

  /**
   * Get stage data by stage number
   * @param {number} stageNumber - The stage number (1-9)
   * @returns {Object|undefined} Stage data or undefined if not found
   */
  function getStage(stageNumber) {
    return stages.find((s) => s.stage_number === stageNumber && !s.sub_stage);
  }

  /**
   * Get all Stage 8 platform-specific stages
   * Stage 8 is split into 4 sub-stages: instagram, twitter, linkedin, facebook
   * @returns {Object} Map of platform -> stage data
   */
  function getStage8Platforms() {
    const platforms = {};
    stages
      .filter((s) => s.stage_number === 8 && s.sub_stage)
      .forEach((s) => {
        platforms[s.sub_stage] = s;
      });
    return platforms;
  }

  // ============================================================================
  // DELETE HANDLERS
  // ============================================================================

  /**
   * Handle delete confirmation
   */
  async function handleDeleteConfirm() {
    try {
      console.log('[ReviewHub] Deleting episode:', episodeId);
      await api.episodes.delete(episodeId);

      console.log('[ReviewHub] Episode deleted successfully');
      setShowDeleteDialog(false);

      // Navigate back to dashboard after successful deletion
      navigate('/', { replace: true });
    } catch (err) {
      console.error('[ReviewHub] Failed to delete episode:', err);
      setDeleteError(err.message || 'Failed to delete episode. Please try again.');
      throw err; // Re-throw to keep dialog open
    }
  }

  // ============================================================================
  // TITLE EDITING HANDLERS
  // ============================================================================

  /**
   * Start editing the episode title
   */
  function handleStartEditTitle() {
    // Pre-populate with user-provided title or AI-generated title
    const currentTitle = episode?.episode_context?.title || episode?.title || '';
    setEditedTitle(currentTitle);
    setIsEditingTitle(true);
  }

  /**
   * Cancel title editing
   */
  function handleCancelEditTitle() {
    setIsEditingTitle(false);
    setEditedTitle('');
  }

  /**
   * Save the edited title
   */
  async function handleSaveTitle() {
    if (!editedTitle.trim()) {
      setError('Title cannot be empty');
      return;
    }

    try {
      setSavingTitle(true);
      console.log('[ReviewHub] Saving episode title:', editedTitle);

      // Update episode_context with new title
      const updatedContext = {
        ...(episode?.episode_context || {}),
        title: editedTitle.trim(),
      };

      await api.episodes.update(episodeId, { episode_context: updatedContext });

      // Update local state
      setEpisode((prev) => ({
        ...prev,
        episode_context: updatedContext,
      }));

      setIsEditingTitle(false);
      setEditedTitle('');
      console.log('[ReviewHub] Title saved successfully');
    } catch (err) {
      console.error('[ReviewHub] Failed to save title:', err);
      setError(err.message || 'Failed to save title');
    } finally {
      setSavingTitle(false);
    }
  }

  /**
   * Handle keyboard events in title input
   */
  function handleTitleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEditTitle();
    }
  }

  // ============================================================================
  // CLIPBOARD HANDLERS
  // ============================================================================

  /**
   * Copy text to clipboard with visual feedback
   * @param {string} text - Text to copy
   * @param {string} id - Identifier for visual feedback
   */
  async function copyToClipboard(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  // ============================================================================
  // BLOG EDITING HANDLERS
  // ============================================================================

  /**
   * Start editing the blog post content
   * @param {string} currentContent - Current blog content
   */
  function handleStartEditBlog(currentContent) {
    setEditedBlogContent(currentContent || '');
    setIsEditingBlog(true);
  }

  /**
   * Cancel blog editing
   */
  function handleCancelEditBlog() {
    setIsEditingBlog(false);
    setEditedBlogContent('');
  }

  /**
   * Save the edited blog content
   * @param {Object} stage - The stage to update (stage 7 for edited blog)
   */
  async function handleSaveBlog(stage) {
    if (!stage) {
      setError('Stage not found');
      return;
    }

    try {
      setSavingBlog(true);
      console.log('[ReviewHub] Saving blog content for stage:', stage.id);

      // Use the stage ID for the API call
      await api.stages.update(stage.id, {
        output_text: editedBlogContent,
      });

      // Update local state to reflect the change immediately
      setStages((prev) =>
        prev.map((s) =>
          s.id === stage.id ? { ...s, output_text: editedBlogContent } : s
        )
      );

      setIsEditingBlog(false);
      setEditedBlogContent('');
      console.log('[ReviewHub] Blog content saved successfully');
    } catch (err) {
      console.error('[ReviewHub] Failed to save blog content:', err);
      setError(err.message || 'Failed to save blog content');
    } finally {
      setSavingBlog(false);
    }
  }

  // ============================================================================
  // LIBRARY & SCHEDULE HANDLERS
  // ============================================================================

  /**
   * Open save to library modal
   * @param {Object} data - Content data to save
   */
  function handleOpenSaveLibrary(data) {
    setSaveLibraryData(data);
  }

  /**
   * Save content to library
   * @param {Object} libraryFormData - Form data from modal (title, tags, is_favorite)
   */
  async function handleSaveToLibrary(libraryFormData) {
    if (!saveLibraryData) return;

    try {
      setSavingToLibrary(true);
      console.log('[ReviewHub] Saving to library:', saveLibraryData.content_type);

      await api.library.create({
        title: libraryFormData.title,
        content_type: saveLibraryData.content_type,
        platform: saveLibraryData.platform || null,
        content: saveLibraryData.content,
        episode_id: episodeId,
        source_stage: saveLibraryData.source_stage,
        source_sub_stage: saveLibraryData.source_sub_stage || null,
        tags: libraryFormData.tags || [],
        topic_ids: libraryFormData.topic_ids || [],
        metadata: saveLibraryData.metadata || {},
      });

      showToast({
        message: 'Saved to library!',
        variant: 'success',
        action: () => navigate('/library'),
        actionLabel: 'View library',
      });

      setSaveLibraryData(null);

      // Refresh status to show updated indicators
      fetchContentStatus();
    } catch (err) {
      console.error('[ReviewHub] Failed to save to library:', err);
      showToast({
        message: 'Failed to save to library',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setSavingToLibrary(false);
    }
  }

  /**
   * Open schedule modal
   * @param {Object} data - Content data to schedule
   */
  function handleOpenSchedule(data) {
    setEditingCalendarItem(null);
    setScheduleData(data);
  }

  /**
   * Open schedule modal for rescheduling existing item
   * @param {Object} calendarItem - Existing calendar item to reschedule
   * @param {Object} contentData - Original content data
   */
  function handleOpenReschedule(calendarItem, contentData) {
    setEditingCalendarItem(calendarItem);
    setScheduleData(contentData);
  }

  /**
   * Schedule or reschedule content on calendar
   * @param {Object} scheduleFormData - Form data from modal (scheduled_date, scheduled_time, status, notes)
   */
  async function handleScheduleContent(scheduleFormData) {
    if (!scheduleData) return;

    try {
      setScheduling(true);

      if (editingCalendarItem) {
        // Rescheduling existing item
        console.log('[ReviewHub] Rescheduling content:', editingCalendarItem.id);

        await api.calendar.update(editingCalendarItem.id, {
          scheduled_date: scheduleFormData.scheduled_date,
          scheduled_time: scheduleFormData.scheduled_time,
          status: scheduleFormData.status,
          notes: scheduleFormData.notes,
        });

        showToast({
          message: 'Content rescheduled!',
          description: `Now scheduled for ${scheduleFormData.scheduled_date}`,
          variant: 'success',
          action: () => navigate('/calendar'),
          actionLabel: 'View calendar',
        });
      } else {
        // Creating new schedule
        console.log('[ReviewHub] Scheduling content:', scheduleData.content_type);

        await api.calendar.create({
          title: scheduleData.title,
          content_type: scheduleData.content_type,
          platform: scheduleData.platform || null,
          full_content: scheduleData.content,
          episode_id: episodeId,
          metadata: scheduleData.metadata || {},
          ...scheduleFormData,
        });

        showToast({
          message: 'Content scheduled!',
          description: `Scheduled for ${scheduleFormData.scheduled_date}`,
          variant: 'success',
          action: () => navigate('/calendar'),
          actionLabel: 'View calendar',
        });
      }

      setScheduleData(null);
      setEditingCalendarItem(null);

      // Refresh status to show updated indicators
      fetchContentStatus();
    } catch (err) {
      console.error('[ReviewHub] Failed to schedule content:', err);
      showToast({
        message: editingCalendarItem ? 'Failed to reschedule' : 'Failed to schedule content',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setScheduling(false);
    }
  }

  /**
   * Remove content from calendar (unschedule)
   * @param {string} calendarItemId - Calendar item to remove
   */
  async function handleUnschedule(calendarItemId) {
    try {
      setUnscheduling(calendarItemId);
      console.log('[ReviewHub] Unscheduling content:', calendarItemId);

      await api.calendar.delete(calendarItemId);

      showToast({
        message: 'Removed from schedule',
        variant: 'success',
      });

      // Refresh status to update indicators
      fetchContentStatus();
    } catch (err) {
      console.error('[ReviewHub] Failed to unschedule:', err);
      showToast({
        message: 'Failed to remove from schedule',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setUnscheduling(null);
    }
  }

  // ============================================================================
  // STAGE CONTENT EDITING HANDLERS
  // ============================================================================

  /**
   * Update stage output_data with new content
   * Generic handler used by all tabs for editing individual items
   *
   * @param {string} stageId - Stage UUID
   * @param {Object} newOutputData - New output_data object
   * @param {string} saveKey - Unique key for tracking save state (e.g., 'quote-0')
   */
  async function handleUpdateStageData(stageId, newOutputData, saveKey) {
    const logPrefix = '[ReviewHub:StageEdit]';

    try {
      setSavingStageContent((prev) => ({ ...prev, [saveKey]: true }));
      console.log(`${logPrefix} Updating stage content:`, {
        stageId,
        saveKey,
        dataKeys: Object.keys(newOutputData),
      });

      await api.stages.update(stageId, { output_data: newOutputData });

      // Update local state immediately for responsive UX
      setStages((prev) =>
        prev.map((s) =>
          s.id === stageId ? { ...s, output_data: newOutputData } : s
        )
      );

      console.log(`${logPrefix} Stage content updated successfully:`, { stageId, saveKey });

      showToast({
        message: 'Changes saved',
        variant: 'success',
      });
    } catch (err) {
      console.error(`${logPrefix} Failed to update stage content:`, {
        stageId,
        saveKey,
        error: err.message,
        errorStack: err.stack,
      });

      showToast({
        message: 'Failed to save changes',
        description: err.message,
        variant: 'error',
      });

      throw err; // Re-throw so EditableCard/EditableText can handle it
    } finally {
      setSavingStageContent((prev) => ({ ...prev, [saveKey]: false }));
    }
  }

  /**
   * Update a quote in Stage 2
   * @param {Object} stage - Stage 2 data
   * @param {number} index - Quote index
   * @param {Object} updatedQuote - Updated quote object
   */
  async function handleUpdateQuote(stage, index, updatedQuote) {
    const logPrefix = '[ReviewHub:QuoteEdit]';
    console.log(`${logPrefix} Updating quote at index ${index}:`, {
      stageId: stage.id,
      oldText: stage.output_data.quotes[index]?.text?.substring(0, 50),
      newText: updatedQuote.text?.substring(0, 50),
    });

    const updatedQuotes = [...stage.output_data.quotes];
    updatedQuotes[index] = updatedQuote;

    await handleUpdateStageData(
      stage.id,
      { ...stage.output_data, quotes: updatedQuotes },
      `quote-${index}`
    );
  }

  /**
   * Delete a quote from Stage 2
   * @param {Object} stage - Stage 2 data
   * @param {number} index - Quote index to delete
   */
  async function handleDeleteQuote(stage, index) {
    const logPrefix = '[ReviewHub:QuoteDelete]';
    const quoteToDelete = stage.output_data.quotes[index];

    console.log(`${logPrefix} Deleting quote at index ${index}:`, {
      stageId: stage.id,
      quoteText: quoteToDelete?.text?.substring(0, 50),
      remainingCount: stage.output_data.quotes.length - 1,
    });

    // Prevent deleting if only 1 quote remains
    if (stage.output_data.quotes.length <= 1) {
      console.warn(`${logPrefix} Cannot delete last quote`);
      showToast({
        message: 'Cannot delete',
        description: 'At least one quote must remain',
        variant: 'warning',
      });
      return;
    }

    const updatedQuotes = stage.output_data.quotes.filter((_, i) => i !== index);

    await handleUpdateStageData(
      stage.id,
      { ...stage.output_data, quotes: updatedQuotes },
      `quote-delete-${index}`
    );

    showToast({
      message: 'Quote deleted',
      variant: 'success',
    });
  }

  /**
   * Update a title item in Stage 5
   * @param {Object} stage - Stage 5 data
   * @param {string} category - Category key (headlines, subheadings, taglines, social_hooks)
   * @param {number} index - Item index
   * @param {string} newValue - New text value
   */
  async function handleUpdateTitleItem(stage, category, index, newValue) {
    const logPrefix = '[ReviewHub:TitleEdit]';
    console.log(`${logPrefix} Updating ${category}[${index}]:`, {
      stageId: stage.id,
      category,
      oldValue: stage.output_data[category]?.[index]?.substring(0, 30),
      newValue: newValue?.substring(0, 30),
    });

    const updatedArray = [...(stage.output_data[category] || [])];
    updatedArray[index] = newValue;

    await handleUpdateStageData(
      stage.id,
      { ...stage.output_data, [category]: updatedArray },
      `title-${category}-${index}`
    );
  }

  /**
   * Delete a title item from Stage 5
   * @param {Object} stage - Stage 5 data
   * @param {string} category - Category key
   * @param {number} index - Item index to delete
   */
  async function handleDeleteTitleItem(stage, category, index) {
    const logPrefix = '[ReviewHub:TitleDelete]';
    const currentArray = stage.output_data[category] || [];

    console.log(`${logPrefix} Deleting ${category}[${index}]:`, {
      stageId: stage.id,
      category,
      itemValue: currentArray[index]?.substring(0, 30),
      remainingCount: currentArray.length - 1,
    });

    // Prevent deleting if only 1 item remains in category
    if (currentArray.length <= 1) {
      console.warn(`${logPrefix} Cannot delete last item in ${category}`);
      showToast({
        message: 'Cannot delete',
        description: `At least one ${category.replace('_', ' ').slice(0, -1)} must remain`,
        variant: 'warning',
      });
      return;
    }

    const updatedArray = currentArray.filter((_, i) => i !== index);

    await handleUpdateStageData(
      stage.id,
      { ...stage.output_data, [category]: updatedArray },
      `title-delete-${category}-${index}`
    );

    showToast({
      message: 'Item deleted',
      variant: 'success',
    });
  }

  /**
   * Update a social post in Stage 8
   * @param {Object} stage - Platform-specific Stage 8 data
   * @param {string} platform - Platform name
   * @param {number} index - Post index
   * @param {Object} updatedPost - Updated post object
   */
  async function handleUpdateSocialPost(stage, platform, index, updatedPost) {
    const logPrefix = '[ReviewHub:SocialEdit]';
    console.log(`${logPrefix} Updating ${platform} post[${index}]:`, {
      stageId: stage.id,
      platform,
      oldContent: stage.output_data.posts[index]?.content?.substring(0, 50),
      newContent: updatedPost.content?.substring(0, 50),
    });

    const updatedPosts = [...stage.output_data.posts];
    updatedPosts[index] = updatedPost;

    await handleUpdateStageData(
      stage.id,
      { ...stage.output_data, posts: updatedPosts },
      `social-${platform}-${index}`
    );
  }

  /**
   * Delete a social post from Stage 8
   * @param {Object} stage - Platform-specific Stage 8 data
   * @param {string} platform - Platform name
   * @param {number} index - Post index to delete
   */
  async function handleDeleteSocialPost(stage, platform, index) {
    const logPrefix = '[ReviewHub:SocialDelete]';
    const currentPosts = stage.output_data.posts || [];

    console.log(`${logPrefix} Deleting ${platform} post[${index}]:`, {
      stageId: stage.id,
      platform,
      postContent: currentPosts[index]?.content?.substring(0, 50),
      remainingCount: currentPosts.length - 1,
    });

    // Prevent deleting if only 1 post remains
    if (currentPosts.length <= 1) {
      console.warn(`${logPrefix} Cannot delete last post for ${platform}`);
      showToast({
        message: 'Cannot delete',
        description: 'At least one post must remain',
        variant: 'warning',
      });
      return;
    }

    const updatedPosts = currentPosts.filter((_, i) => i !== index);

    await handleUpdateStageData(
      stage.id,
      { ...stage.output_data, posts: updatedPosts },
      `social-delete-${platform}-${index}`
    );

    showToast({
      message: 'Post deleted',
      variant: 'success',
    });
  }

  /**
   * Update email content in Stage 9
   * @param {Object} stage - Stage 9 data
   * @param {string} field - Field to update (subject_lines, preview_text, email_body, followup_email)
   * @param {number|null} index - Index for array fields, null for string fields
   * @param {string} newValue - New value
   */
  async function handleUpdateEmailContent(stage, field, index, newValue) {
    const logPrefix = '[ReviewHub:EmailEdit]';
    console.log(`${logPrefix} Updating email ${field}${index !== null ? `[${index}]` : ''}:`, {
      stageId: stage.id,
      field,
      index,
      newValueLength: newValue?.length,
    });

    let updatedData = { ...stage.output_data };

    if (index !== null) {
      // Array field (subject_lines, preview_text)
      const updatedArray = [...(stage.output_data[field] || [])];
      updatedArray[index] = newValue;
      updatedData[field] = updatedArray;
    } else {
      // String field (email_body, followup_email)
      updatedData[field] = newValue;
    }

    await handleUpdateStageData(
      stage.id,
      updatedData,
      `email-${field}${index !== null ? `-${index}` : ''}`
    );
  }

  /**
   * Delete an email array item from Stage 9
   * @param {Object} stage - Stage 9 data
   * @param {string} field - Array field (subject_lines, preview_text)
   * @param {number} index - Index to delete
   */
  async function handleDeleteEmailItem(stage, field, index) {
    const logPrefix = '[ReviewHub:EmailDelete]';
    const currentArray = stage.output_data[field] || [];

    console.log(`${logPrefix} Deleting email ${field}[${index}]:`, {
      stageId: stage.id,
      field,
      itemValue: currentArray[index]?.substring(0, 30),
      remainingCount: currentArray.length - 1,
    });

    // Prevent deleting if only 1 item remains
    if (currentArray.length <= 1) {
      console.warn(`${logPrefix} Cannot delete last ${field.replace('_', ' ')}`);
      showToast({
        message: 'Cannot delete',
        description: `At least one ${field.replace('_', ' ').slice(0, -1)} must remain`,
        variant: 'warning',
      });
      return;
    }

    const updatedArray = currentArray.filter((_, i) => i !== index);

    await handleUpdateStageData(
      stage.id,
      { ...stage.output_data, [field]: updatedArray },
      `email-delete-${field}-${index}`
    );

    showToast({
      message: 'Item deleted',
      variant: 'success',
    });
  }

  /**
   * Update analysis content in Stage 1
   * @param {Object} stage - Stage 1 data
   * @param {string} field - Field to update
   * @param {*} newValue - New value
   */
  async function handleUpdateAnalysis(stage, field, newValue) {
    const logPrefix = '[ReviewHub:AnalysisEdit]';
    console.log(`${logPrefix} Updating analysis ${field}:`, {
      stageId: stage.id,
      field,
    });

    await handleUpdateStageData(
      stage.id,
      { ...stage.output_data, [field]: newValue },
      `analysis-${field}`
    );
  }

  if (loading) {
    return <Spinner centered text="Loading content..." />;
  }

  if (!episode) {
    return (
      <Card className={styles.errorCard}>
        <AlertCircle size={48} />
        <h2>Episode Not Found</h2>
        <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
      </Card>
    );
  }

  const currentTab = TABS.find((t) => t.id === activeTab);
  // Check title from multiple sources: user-provided (episode_context.title), AI-generated (episode.title)
  const episodeTitle = episode.episode_context?.title || episode.title || 'Untitled Episode';

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {/* Back button */}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={ArrowLeft}
            onClick={() => navigate('/')}
            className={styles.backButton}
          >
            Back
          </Button>

          {/* Editable title */}
          <div className={styles.titleWrapper}>
            {isEditingTitle ? (
              <div className={styles.titleEditGroup}>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  className={styles.titleInput}
                  placeholder="Enter episode title..."
                  disabled={savingTitle}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={Check}
                  onClick={handleSaveTitle}
                  loading={savingTitle}
                  disabled={!editedTitle.trim()}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={X}
                  onClick={handleCancelEditTitle}
                  disabled={savingTitle}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className={styles.titleDisplay}>
                <h1 className={styles.title}>{episodeTitle}</h1>
                <button
                  className={styles.editTitleButton}
                  onClick={handleStartEditTitle}
                  title="Edit title"
                  aria-label="Edit episode title"
                >
                  <Edit3 size={16} />
                </button>
              </div>
            )}
            <p className={styles.subtitle}>Review and edit your generated content</p>
          </div>
        </div>

        {/* Header actions */}
        <div className={styles.headerActions}>
          <Button
            variant="danger"
            size="sm"
            leftIcon={Trash2}
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete Episode
          </Button>
        </div>
      </header>

      {/* Episode Hero - shows metadata from Stage 0 content brief */}
      <EpisodeHero
        episode={episode}
        contentBrief={getStage(0)?.output_data}
        episodeSummary={getStage(1)?.output_data}
      />

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon className={styles.tabIcon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className={styles.errorBanner}>
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Tab content */}
      <div className={styles.content}>
        {activeTab === 'analysis' && (
          <AnalysisTab
            stage={getStage(1)}
            contentBriefStage={getStage(0)}
            onUpdateAnalysis={handleUpdateAnalysis}
            savingState={savingStageContent}
          />
        )}

        {activeTab === 'quotes' && (
          <QuotesTab
            stage={getStage(2)}
            onCopy={copyToClipboard}
            copied={copied}
            onUpdateQuote={handleUpdateQuote}
            onDeleteQuote={handleDeleteQuote}
            savingState={savingStageContent}
          />
        )}

        {activeTab === 'titles' && (
          <TitlesTab
            stage={getStage(5)}
            onCopy={copyToClipboard}
            copied={copied}
            onUpdateTitleItem={handleUpdateTitleItem}
            onDeleteTitleItem={handleDeleteTitleItem}
            savingState={savingStageContent}
          />
        )}

        {activeTab === 'blog' && (
          <BlogTab
            outlineStage={getStage(3)}
            paragraphsStage={getStage(4)}
            draftStage={getStage(6)}
            editedStage={getStage(7)}
            onCopy={copyToClipboard}
            copied={copied}
            // Blog editing props
            isEditing={isEditingBlog}
            editedContent={editedBlogContent}
            onEditedContentChange={setEditedBlogContent}
            onStartEdit={handleStartEditBlog}
            onSaveEdit={handleSaveBlog}
            onCancelEdit={handleCancelEditBlog}
            savingEdit={savingBlog}
            // Library & schedule props
            onSaveToLibrary={handleOpenSaveLibrary}
            onSchedule={handleOpenSchedule}
            onReschedule={handleOpenReschedule}
            onUnschedule={handleUnschedule}
            unscheduling={unscheduling}
            episodeTitle={episodeTitle}
            // Status tracking
            getLibraryStatus={getLibraryStatus}
            getCalendarStatus={getCalendarStatus}
          />
        )}

        {activeTab === 'social' && (
          <SocialTab
            platformStages={getStage8Platforms()}
            onCopy={copyToClipboard}
            copied={copied}
            // Library & schedule props
            onSaveToLibrary={handleOpenSaveLibrary}
            onSchedule={handleOpenSchedule}
            onReschedule={handleOpenReschedule}
            onUnschedule={handleUnschedule}
            unscheduling={unscheduling}
            episodeTitle={episodeTitle}
            // Status tracking
            getLibraryStatus={getLibraryStatus}
            getCalendarStatus={getCalendarStatus}
            // Editing props
            onUpdateSocialPost={handleUpdateSocialPost}
            onDeleteSocialPost={handleDeleteSocialPost}
            savingState={savingStageContent}
          />
        )}

        {activeTab === 'email' && (
          <EmailTab
            stage={getStage(9)}
            onCopy={copyToClipboard}
            copied={copied}
            // Library & schedule props
            onSaveToLibrary={handleOpenSaveLibrary}
            onSchedule={handleOpenSchedule}
            onReschedule={handleOpenReschedule}
            onUnschedule={handleUnschedule}
            unscheduling={unscheduling}
            episodeTitle={episodeTitle}
            // Status tracking
            getLibraryStatus={getLibraryStatus}
            getCalendarStatus={getCalendarStatus}
            // Editing props
            onUpdateEmailContent={handleUpdateEmailContent}
            onDeleteEmailItem={handleDeleteEmailItem}
            savingState={savingStageContent}
          />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Episode"
        message={`Are you sure you want to delete "${episodeTitle}"?`}
        description={
          deleteError ||
          'This action cannot be undone. All generated content for this episode will be permanently deleted.'
        }
        confirmLabel="Delete Episode"
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Save to Library Modal */}
      <SaveToLibraryModal
        isOpen={!!saveLibraryData}
        onClose={() => setSaveLibraryData(null)}
        onSave={handleSaveToLibrary}
        loading={savingToLibrary}
        contentType={saveLibraryData?.content_type}
        platform={saveLibraryData?.platform}
        content={saveLibraryData?.content || ''}
        initialData={{
          title: saveLibraryData?.title || '',
        }}
        suggestedTopics={getStage(1)?.output_data?.episode_basics?.main_topics || []}
      />

      {/* Schedule Modal */}
      <ScheduleModal
        isOpen={!!scheduleData}
        onClose={() => {
          setScheduleData(null);
          setEditingCalendarItem(null);
        }}
        onSchedule={handleScheduleContent}
        loading={scheduling}
        title={editingCalendarItem ? `Reschedule: ${scheduleData?.title || 'Content'}` : `Schedule: ${scheduleData?.title || 'Content'}`}
        initialData={editingCalendarItem ? {
          scheduled_date: editingCalendarItem.scheduled_date,
          scheduled_time: editingCalendarItem.scheduled_time || '',
          status: editingCalendarItem.status,
          notes: editingCalendarItem.notes || '',
        } : undefined}
      />
    </div>
  );
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function AnalysisTab({ stage, contentBriefStage, onUpdateAnalysis, savingState }) {
  const [editingSummary, setEditingSummary] = useState(false);
  const [expandedThemes, setExpandedThemes] = useState({});
  const [editValue, setEditValue] = useState('');

  console.log('[AnalysisTab] Stage data:', {
    hasStage1: !!stage,
    stage1Status: stage?.status,
    hasStage0: !!contentBriefStage,
    stage0Status: contentBriefStage?.status,
  });

  // Stage 1 data (summary, episode_crux)
  const summaryData = stage?.output_data || {};

  // Stage 0 data (themes, tags, seo_overview)
  const briefData = contentBriefStage?.output_data || {};

  if (!stage && !contentBriefStage) {
    return <EmptyState message="No analysis data" details="Analysis stages not found." />;
  }

  if (stage?.status !== 'completed' && contentBriefStage?.status !== 'completed') {
    return <EmptyState message="Analysis not complete" details="Analysis stages are still processing." />;
  }

  // Toggle theme expansion
  const toggleTheme = (index) => {
    setExpandedThemes(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Start editing summary
  const handleStartEditSummary = () => {
    setEditingSummary(true);
    setEditValue(summaryData.summary || '');
  };

  // Save edited summary
  const handleSaveSummary = async () => {
    if (!editValue.trim()) return;
    try {
      await onUpdateAnalysis(stage, 'summary', editValue.trim());
      setEditingSummary(false);
      setEditValue('');
    } catch (err) {
      console.error('[AnalysisTab] Failed to save summary:', err);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingSummary(false);
    setEditValue('');
  };

  // Get themes from Stage 0 (preferred) or fall back to Stage 1
  const themes = briefData.themes || summaryData.key_themes || [];
  const tags = briefData.tags || [];
  const seoOverview = briefData.seo_overview;

  return (
    <div className={styles.tabContent}>
      {/* SEO Overview - if available from Stage 0 */}
      {seoOverview && (
        <Card title="SEO Overview" subtitle="Search-optimized episode description" padding="lg">
          <p className={styles.seoOverview}>{seoOverview}</p>
        </Card>
      )}

      {/* Full Summary - from Stage 1 */}
      {summaryData.summary && (
        <Card
          title="Episode Summary"
          subtitle="In-depth narrative summary"
          headerAction={
            editingSummary ? (
              <div className={styles.cardActions}>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={Save}
                  onClick={handleSaveSummary}
                  loading={savingState?.['analysis-summary']}
                  disabled={!editValue.trim()}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={X}
                  onClick={handleCancelEdit}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={Edit3}
                onClick={handleStartEditSummary}
              >
                Edit
              </Button>
            )
          }
          padding="lg"
        >
          {editingSummary ? (
            <textarea
              className={styles.blogTextarea}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Enter the episode summary..."
              disabled={savingState?.['analysis-summary']}
              style={{ minHeight: '200px' }}
            />
          ) : (
            <p className={styles.summaryText}>{summaryData.summary}</p>
          )}
        </Card>
      )}

      {/* Key Themes - from Stage 0 with expandable cards */}
      {themes.length > 0 && (
        <Card title="Key Themes" subtitle={`${themes.length} themes identified`} padding="lg">
          <div className={styles.themesGrid}>
            {themes.map((theme, i) => {
              // Handle both Stage 0 format (name, what_was_discussed, practical_value)
              // and Stage 1 format (theme, description)
              const themeName = theme.name || theme.theme || `Theme ${i + 1}`;
              const whatDiscussed = theme.what_was_discussed || theme.description || '';
              const practicalValue = theme.practical_value || '';
              const isExpanded = expandedThemes[i];

              return (
                <div key={i} className={styles.themeCard}>
                  <button
                    className={styles.themeHeader}
                    onClick={() => toggleTheme(i)}
                  >
                    <span className={styles.themeNumber}>{i + 1}</span>
                    <span className={styles.themeName}>{themeName}</span>
                    {(whatDiscussed || practicalValue) && (
                      isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    )}
                  </button>

                  {isExpanded && (whatDiscussed || practicalValue) && (
                    <div className={styles.themeBody}>
                      {whatDiscussed && (
                        <div className={styles.themeSection}>
                          <span className={styles.themeSectionLabel}>What was discussed</span>
                          <p className={styles.themeSectionText}>{whatDiscussed}</p>
                        </div>
                      )}
                      {practicalValue && (
                        <div className={styles.themeSection}>
                          <span className={styles.themeSectionLabel}>
                            <Lightbulb size={14} />
                            Practical value
                          </span>
                          <p className={styles.themeSectionText}>{practicalValue}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Tags - from Stage 0 */}
      {tags.length > 0 && (
        <Card title="Topic Tags" subtitle="Keywords for categorization and SEO" padding="lg">
          <div className={styles.tagsList}>
            {tags.map((tag, i) => (
              <Badge key={i} variant="default" className={styles.topicTag}>
                {tag}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * QuotesTab - Displays extracted quotes AND actionable tips from Stage 2
 *
 * Quote structure (from Stage 2):
 * - text: The verbatim quote (required)
 * - speaker: Who said it (required)
 * - context: Why it's significant (optional)
 * - usage: Suggested use - headline/pullquote/social/key_point (optional)
 *
 * Tip structure (from Stage 2):
 * - tip: The actionable advice (required)
 * - context: When/why to use it (required)
 * - category: mindset/communication/practice/boundary/self-care/relationship/professional
 */
function QuotesTab({ stage, onCopy, copied, onUpdateQuote, onDeleteQuote, savingState }) {
  const [activeSection, setActiveSection] = useState('quotes');
  const [editingIndex, setEditingIndex] = useState(null);
  const [usageFilter, setUsageFilter] = useState('all');

  console.log('[QuotesTab] Stage 2 data:', {
    hasStage: !!stage,
    stageStatus: stage?.status,
    hasOutputData: !!stage?.output_data,
    hasQuotes: !!stage?.output_data?.quotes,
    quoteCount: stage?.output_data?.quotes?.length,
    hasTips: !!stage?.output_data?.tips,
    tipCount: stage?.output_data?.tips?.length,
  });

  if (!stage) {
    return <EmptyState message="No quotes extracted" details="Stage 2 (Quote Extraction) not found." />;
  }

  if (stage.status !== 'completed') {
    return <EmptyState message="Quotes not ready" details={`Stage 2 status: ${stage.status}`} />;
  }

  if (!stage?.output_data?.quotes) {
    return <EmptyState message="No quotes extracted" details="Stage 2 completed but has no quotes data." />;
  }

  const quotes = stage.output_data.quotes || [];
  const tips = stage.output_data.tips || [];

  // Field definitions for quote editing
  const quoteFields = [
    { key: 'text', label: 'Quote', required: true, multiline: true, rows: 3, placeholder: 'Enter the quote text...' },
    { key: 'speaker', label: 'Speaker', required: true, placeholder: 'Who said this?' },
    { key: 'context', label: 'Context', required: false, multiline: true, rows: 2, placeholder: 'Why is this quote significant?' },
    { key: 'usage', label: 'Suggested Use', required: false, placeholder: 'headline, pullquote, social, or key_point' },
  ];

  // Get unique usage types for filter
  const usageTypes = [...new Set(quotes.map(q => q.usage).filter(Boolean))];

  // Filter quotes by usage
  const filteredQuotes = usageFilter === 'all'
    ? quotes
    : quotes.filter(q => q.usage === usageFilter);

  // Category badge colors
  const categoryColors = {
    mindset: 'primary',
    communication: 'info',
    practice: 'success',
    boundary: 'warning',
    'self-care': 'secondary',
    relationship: 'default',
    professional: 'default',
  };

  // Category icons/emojis
  const categoryIcons = {
    mindset: '🧠',
    communication: '💬',
    practice: '🎯',
    boundary: '🛡️',
    'self-care': '💚',
    relationship: '👥',
    professional: '💼',
  };

  return (
    <div className={styles.tabContent}>
      {/* Section toggle - Quotes vs Tips */}
      <div className={styles.pillNav}>
        <button
          className={`${styles.pill} ${activeSection === 'quotes' ? styles.pillActive : ''}`}
          onClick={() => setActiveSection('quotes')}
        >
          <Quote size={14} />
          <span>Quotes</span>
          <span className={styles.pillCount}>{quotes.length}</span>
        </button>
        {tips.length > 0 && (
          <button
            className={`${styles.pill} ${activeSection === 'tips' ? styles.pillActive : ''}`}
            onClick={() => setActiveSection('tips')}
          >
            <Lightbulb size={14} />
            <span>Actionable Tips</span>
            <span className={styles.pillCount}>{tips.length}</span>
          </button>
        )}
      </div>

      {/* QUOTES SECTION */}
      {activeSection === 'quotes' && (
        <>
          {/* Usage filter */}
          {usageTypes.length > 1 && (
            <div className={styles.filterBar}>
              <span className={styles.filterLabel}>Filter by usage:</span>
              <div className={styles.filterPills}>
                <button
                  className={`${styles.filterPill} ${usageFilter === 'all' ? styles.filterPillActive : ''}`}
                  onClick={() => setUsageFilter('all')}
                >
                  All ({quotes.length})
                </button>
                {usageTypes.map(usage => (
                  <button
                    key={usage}
                    className={`${styles.filterPill} ${usageFilter === usage ? styles.filterPillActive : ''}`}
                    onClick={() => setUsageFilter(usage)}
                  >
                    {usage} ({quotes.filter(q => q.usage === usage).length})
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredQuotes.map((quote, i) => {
            const originalIndex = quotes.indexOf(quote);
            return (
              <Card key={originalIndex} padding="lg" className={styles.quoteCard}>
                {editingIndex === originalIndex ? (
                  <EditableCard
                    item={quote}
                    fields={quoteFields}
                    onSave={async (updatedQuote) => {
                      await onUpdateQuote(stage, originalIndex, updatedQuote);
                      setEditingIndex(null);
                    }}
                    onDelete={async () => {
                      await onDeleteQuote(stage, originalIndex);
                    }}
                    canDelete={quotes.length > 1}
                    itemId={`quote-${originalIndex}`}
                    deleteConfirmText="Are you sure you want to delete this quote?"
                  />
                ) : (
                  <>
                    <div className={styles.quoteHeader}>
                      {quote.usage && (
                        <Badge
                          variant={quote.usage === 'headline' ? 'primary' : quote.usage === 'social' ? 'info' : 'secondary'}
                          className={styles.quoteUsageBadge}
                        >
                          {quote.usage}
                        </Badge>
                      )}
                    </div>
                    <blockquote className={styles.quote}>
                      "{quote.text}"
                    </blockquote>
                    <p className={styles.quoteSpeaker}>— {quote.speaker}</p>
                    {quote.context && (
                      <div className={styles.quoteContextBox}>
                        <span className={styles.quoteContextLabel}>Why this matters</span>
                        <p className={styles.quoteContextText}>{quote.context}</p>
                      </div>
                    )}
                    <div className={styles.postActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={Edit3}
                        onClick={() => setEditingIndex(originalIndex)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={copied === `quote-${originalIndex}` ? Check : Copy}
                        onClick={() => onCopy(quote.text, `quote-${originalIndex}`)}
                      >
                        {copied === `quote-${originalIndex}` ? 'Copied!' : 'Copy'}
                      </Button>
                      {quotes.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={Trash2}
                          onClick={() => onDeleteQuote(stage, originalIndex)}
                          loading={savingState?.[`quote-delete-${originalIndex}`]}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </>
      )}

      {/* TIPS SECTION */}
      {activeSection === 'tips' && tips.length > 0 && (
        <div className={styles.tipsGrid}>
          {tips.map((tip, i) => (
            <Card key={i} padding="md" className={styles.tipCard}>
              <div className={styles.tipHeader}>
                <span className={styles.tipIcon}>{categoryIcons[tip.category] || '💡'}</span>
                <Badge variant={categoryColors[tip.category] || 'default'} className={styles.tipCategory}>
                  {tip.category}
                </Badge>
              </div>
              <p className={styles.tipText}>{tip.tip}</p>
              {tip.context && (
                <p className={styles.tipContext}>
                  <strong>When to use:</strong> {tip.context}
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                leftIcon={copied === `tip-${i}` ? Check : Copy}
                onClick={() => onCopy(tip.tip, `tip-${i}`)}
                className={styles.tipCopyBtn}
              >
                {copied === `tip-${i}` ? 'Copied!' : 'Copy'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * TitlesTab - Displays headlines, subheadings, taglines, and social hooks from Stage 5
 * Uses pill navigation to switch between categories for reduced scrolling
 * Supports inline editing and deletion of individual items
 *
 * Stage 5 output structure:
 * - headlines: array of strings (10-15 main blog title options)
 * - subheadings: array of strings (8-10 section header options)
 * - taglines: array of strings (5-7 short punchy summaries)
 * - social_hooks: array of strings (5-7 social media opening lines)
 */
function TitlesTab({ stage, onCopy, copied, onUpdateTitleItem, onDeleteTitleItem, savingState }) {
  const [activeCategory, setActiveCategory] = useState('headlines');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Debug logging to help identify data issues
  console.log('[TitlesTab] Stage 5 data:', {
    hasStage: !!stage,
    stageStatus: stage?.status,
    hasOutputData: !!stage?.output_data,
    outputDataKeys: stage?.output_data ? Object.keys(stage.output_data) : [],
  });

  if (!stage) {
    return <EmptyState message="No titles generated" details="Stage 5 (Headlines & Copy) not found. This stage may not have run yet." />;
  }

  if (stage.status === 'pending') {
    return <EmptyState message="Titles pending" details="Stage 5 has not been processed yet." />;
  }

  if (stage.status === 'processing') {
    return <EmptyState message="Generating titles..." details="Stage 5 is currently processing." />;
  }

  if (stage.status === 'failed') {
    return <EmptyState message="Title generation failed" details={stage.error_message || 'Stage 5 encountered an error.'} />;
  }

  if (!stage.output_data) {
    return <EmptyState message="No titles generated" details="Stage 5 completed but has no output data." />;
  }

  const { headlines = [], subheadings = [], taglines = [], social_hooks = [] } = stage.output_data;

  // Category definitions with counts
  const categories = [
    { id: 'headlines', label: 'Headlines', count: headlines.length, description: 'Main blog title options' },
    { id: 'taglines', label: 'Taglines', count: taglines.length, description: 'Short punchy summaries' },
    { id: 'social_hooks', label: 'Social Hooks', count: social_hooks.length, description: 'Social media opening lines' },
    { id: 'subheadings', label: 'Subheadings', count: subheadings.length, description: 'Section header options' },
  ].filter(cat => cat.count > 0);

  // Get current items based on active category
  const getCurrentItems = () => {
    switch (activeCategory) {
      case 'headlines': return headlines;
      case 'taglines': return taglines;
      case 'social_hooks': return social_hooks;
      case 'subheadings': return subheadings;
      default: return [];
    }
  };

  const currentCategory = categories.find(c => c.id === activeCategory) || categories[0];
  const currentItems = getCurrentItems();

  // Start editing an item
  const handleStartEdit = (index) => {
    console.log('[TitlesTab] Starting edit for', activeCategory, 'index', index);
    setEditingIndex(index);
    setEditValue(currentItems[index] || '');
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  // Save edited item
  const handleSaveEdit = async (index) => {
    if (!editValue.trim()) {
      console.warn('[TitlesTab] Cannot save empty value');
      return;
    }
    console.log('[TitlesTab] Saving edit for', activeCategory, 'index', index);
    try {
      await onUpdateTitleItem(stage, activeCategory, index, editValue.trim());
      setEditingIndex(null);
      setEditValue('');
    } catch (err) {
      console.error('[TitlesTab] Failed to save edit:', err);
    }
  };

  // Handle keyboard events in edit mode
  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(index);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className={styles.tabContent}>
      {/* Category pill navigation */}
      <div className={styles.pillNav}>
        {categories.map((category) => (
          <button
            key={category.id}
            className={`${styles.pill} ${activeCategory === category.id ? styles.pillActive : ''}`}
            onClick={() => {
              setActiveCategory(category.id);
              setEditingIndex(null); // Cancel any editing when switching categories
            }}
          >
            <span>{category.label}</span>
            <span className={styles.pillCount}>{category.count}</span>
          </button>
        ))}
      </div>

      {/* Content area */}
      <Card
        title={currentCategory?.label}
        subtitle={currentCategory?.description}
        padding="lg"
      >
        <div className={styles.titlesList}>
          {currentItems.map((item, i) => (
            <div key={i} className={styles.titleItem}>
              {editingIndex === i ? (
                <div className={styles.titleEditGroup}>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    className={styles.titleInput}
                    autoFocus
                  />
                  <span className={styles.charCount}>{editValue.length} chars</span>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={Check}
                    onClick={() => handleSaveEdit(i)}
                    loading={savingState?.[`title-${activeCategory}-${i}`]}
                    disabled={!editValue.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={X}
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <div className={styles.titleTextWrapper}>
                    <span className={styles.titleText}>{item}</span>
                    <span className={styles.charCountSmall}>{item.length} chars</span>
                  </div>
                  <div className={styles.cardActions}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={Edit3}
                      onClick={() => handleStartEdit(i)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={copied === `${activeCategory}-${i}` ? Check : Copy}
                      onClick={() => onCopy(item, `${activeCategory}-${i}`)}
                    >
                      {copied === `${activeCategory}-${i}` ? 'Copied!' : 'Copy'}
                    </Button>
                    {currentItems.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={Trash2}
                        onClick={() => onDeleteTitleItem(stage, activeCategory, i)}
                        loading={savingState?.[`title-delete-${activeCategory}-${i}`]}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * BlogTab component with inline editing support
 * Allows viewing, copying, and editing the blog post content
 *
 * Stage Data Used:
 * - outlineStage (Stage 3): High-level blog outline with sections
 * - paragraphsStage (Stage 4): Detailed paragraph-level content
 * - draftStage (Stage 6): Initial blog post draft
 * - editedStage (Stage 7): Refined final blog post
 */
function BlogTab({
  outlineStage,
  paragraphsStage,
  draftStage,
  editedStage,
  onCopy,
  copied,
  // Editing props
  isEditing,
  editedContent,
  onEditedContentChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  savingEdit,
  // Library & schedule props
  onSaveToLibrary,
  onSchedule,
  onReschedule,
  onUnschedule,
  unscheduling,
  episodeTitle,
  // Status tracking
  getLibraryStatus,
  getCalendarStatus,
}) {
  const blogPost = editedStage?.output_text || draftStage?.output_text;
  // Use editedStage if available, otherwise fall back to draftStage for saving
  const stageToUpdate = editedStage || draftStage;

  // Check library and calendar status for the blog post
  const libraryItem = blogPost ? getLibraryStatus('blog', null, blogPost) : null;
  const calendarItem = blogPost ? getCalendarStatus('blog', null, blogPost) : null;

  // Prepare data for save/schedule
  const blogData = blogPost ? {
    title: episodeTitle,
    content_type: 'blog',
    platform: null,
    content: blogPost,
    source_stage: 7,
  } : null;

  // Format scheduled date for display
  const formatScheduledDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={styles.tabContent}>
      {/* Blog outline section - from Stage 3 */}
      {outlineStage?.output_data?.outline && (
        <Card title="Outline" subtitle="High-level blog structure (Stage 3)" padding="lg">
          <div className={styles.outline}>
            {outlineStage.output_data.outline.map((section, i) => (
              <div key={i} className={styles.outlineSection}>
                <h4>{section.section_title}</h4>
                <ul>
                  {section.key_points?.map((point, j) => (
                    <li key={j}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Blog post section with editing capability */}
      {blogPost && (
        <Card
          title="Blog Post"
          headerAction={
            <div className={styles.cardActions}>
              {isEditing ? (
                <>
                  {/* Editing mode actions */}
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={Save}
                    onClick={() => onSaveEdit(stageToUpdate)}
                    loading={savingEdit}
                    disabled={!editedContent.trim()}
                  >
                    Save Changes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={X}
                    onClick={onCancelEdit}
                    disabled={savingEdit}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {/* View mode actions */}
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={Edit3}
                    onClick={() => onStartEdit(blogPost)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={copied === 'blog' ? Check : Copy}
                    onClick={() => onCopy(blogPost, 'blog')}
                  >
                    Copy
                  </Button>
                  <Button
                    variant={libraryItem ? 'secondary' : 'ghost'}
                    size="sm"
                    leftIcon={libraryItem ? CheckCircle : Bookmark}
                    onClick={() => !libraryItem && onSaveToLibrary(blogData)}
                    disabled={!!libraryItem}
                    title={libraryItem ? 'Already saved to library' : 'Save to library'}
                  >
                    {libraryItem ? 'In Library' : 'Save'}
                  </Button>
                  {calendarItem ? (
                    <div className={styles.scheduledActions}>
                      <Badge variant="primary" className={styles.scheduledBadge}>
                        <Calendar size={12} />
                        {formatScheduledDate(calendarItem.scheduled_date)}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={Calendar}
                        onClick={() => onReschedule(calendarItem, blogData)}
                        title="Change scheduled date"
                      >
                        Reschedule
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={CalendarX}
                        onClick={() => onUnschedule(calendarItem.id)}
                        loading={unscheduling === calendarItem.id}
                        title="Remove from schedule"
                      >
                        Unschedule
                      </Button>
                      {!libraryItem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={Bookmark}
                          onClick={() => onSaveToLibrary(blogData)}
                          title="Also save to library"
                        >
                          Save to Library
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={Calendar}
                      onClick={() => onSchedule(blogData)}
                      title="Schedule content"
                    >
                      Schedule
                    </Button>
                  )}
                </>
              )}
            </div>
          }
          padding="lg"
        >
          {/* Library status indicator - scheduled shown in actions */}
          {libraryItem && !isEditing && (
            <div className={styles.statusIndicators}>
              <Badge variant="success" className={styles.statusBadge}>
                <CheckCircle size={12} />
                In Library
              </Badge>
            </div>
          )}
          <div className={styles.blogPost}>
            {isEditing ? (
              <textarea
                className={styles.blogTextarea}
                value={editedContent}
                onChange={(e) => onEditedContentChange(e.target.value)}
                placeholder="Enter blog post content..."
                disabled={savingEdit}
              />
            ) : (
              <pre className={styles.blogContent}>{blogPost}</pre>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * SocialTab - Displays platform-specific social media content from Stage 8
 * Uses platform pills for quick switching between platforms
 * Supports inline editing and deletion of individual posts
 *
 * Stage 8 is now split into 4 separate sub-stages (one per platform).
 * Each platform stage has its own output_data.posts array.
 *
 * Props:
 * - platformStages: Object map of platform -> stage record (e.g., { instagram: {...}, twitter: {...} })
 * - onUpdateSocialPost: Function(stage, platform, index, updatedPost) to save edited post
 * - onDeleteSocialPost: Function(stage, platform, index) to delete a post
 * - savingState: Object tracking save state by key
 */
function SocialTab({ platformStages, onCopy, copied, onSaveToLibrary, onSchedule, onReschedule, onUnschedule, unscheduling, episodeTitle, getLibraryStatus, getCalendarStatus, onUpdateSocialPost, onDeleteSocialPost, savingState }) {
  const [activePlatform, setActivePlatform] = useState('instagram');
  const [editingIndex, setEditingIndex] = useState(null);

  // Format scheduled date for display
  const formatScheduledDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  console.log('[SocialTab] Platform stages:', {
    platforms: Object.keys(platformStages || {}),
    statuses: Object.entries(platformStages || {}).map(([p, s]) => `${p}: ${s?.status}`),
  });

  // Platform definitions with colors
  const platformConfig = {
    instagram: { label: 'Instagram', color: '#E4405F' },
    twitter: { label: 'Twitter / X', color: '#1DA1F2' },
    linkedin: { label: 'LinkedIn', color: '#0A66C2' },
    facebook: { label: 'Facebook', color: '#1877F2' },
  };

  // Build platforms array from available stages
  const platforms = Object.entries(platformConfig)
    .map(([id, config]) => {
      const stage = platformStages?.[id];
      const posts = stage?.output_data?.posts || [];
      return {
        id,
        label: config.label,
        color: config.color,
        stage,
        posts,
        status: stage?.status || 'pending',
      };
    })
    .filter((platform) => platform.stage); // Only show platforms that have stage data

  // Check if no platforms exist at all
  if (platforms.length === 0) {
    return <EmptyState message="No social content generated" details="Stage 8 (Social Content) not found." />;
  }

  const currentPlatform = platforms.find((p) => p.id === activePlatform) || platforms[0];
  const currentPosts = currentPlatform?.posts || [];
  const isCurrentPlatformReady = currentPlatform?.status === 'completed';

  return (
    <div className={styles.tabContent}>
      {/* Platform pill navigation */}
      <div className={styles.pillNav}>
        {platforms.map((platform) => (
          <button
            key={platform.id}
            className={`${styles.pill} ${styles.platformPill} ${activePlatform === platform.id ? styles.pillActive : ''}`}
            onClick={() => setActivePlatform(platform.id)}
            style={activePlatform === platform.id ? { '--platform-color': platform.color } : {}}
          >
            <span>{platform.label}</span>
            {platform.status === 'completed' ? (
              <span className={styles.pillCount}>{platform.posts.length}</span>
            ) : platform.status === 'processing' ? (
              <Spinner size="sm" />
            ) : (
              <span className={styles.pillStatus}>{platform.status}</span>
            )}
          </button>
        ))}
      </div>

      {/* Posts for selected platform */}
      <Card
        title={currentPlatform?.label}
        subtitle={
          isCurrentPlatformReady
            ? `${currentPosts.length} post${currentPosts.length !== 1 ? 's' : ''} ready to share`
            : `Status: ${currentPlatform?.status}`
        }
        padding="lg"
      >
        {!isCurrentPlatformReady ? (
          <EmptyState
            message={`${currentPlatform?.label} content not ready`}
            details={`Status: ${currentPlatform?.status}`}
          />
        ) : currentPosts.length === 0 ? (
          <EmptyState
            message="No posts generated"
            details="Content generation may still be in progress"
          />
        ) : (
          <div className={styles.socialPlatform}>
            {currentPosts.map((post, i) => {
              const postContent = post.content + (post.hashtags?.length ? '\n\n' + post.hashtags.join(' ') : '');
              const libraryItem = getLibraryStatus('social', currentPlatform?.id, postContent);
              const calendarItem = getCalendarStatus('social', currentPlatform?.id, postContent);

              const postData = {
                title: `${episodeTitle} - ${currentPlatform?.label}`,
                content_type: 'social',
                platform: currentPlatform?.id,
                content: postContent,
                metadata: { type: post.type, hashtags: post.hashtags },
              };

              const libraryData = {
                title: `${currentPlatform?.label} - ${post.type || 'Post'}`,
                content_type: 'social',
                platform: currentPlatform?.id,
                content: postContent,
                source_stage: 8,
                source_sub_stage: currentPlatform?.id,
                metadata: { type: post.type, hashtags: post.hashtags },
              };

              // Field definitions for social post editing
              const socialPostFields = [
                { key: 'content', label: 'Post Content', required: true, multiline: true, rows: 4, placeholder: 'Enter post content...' },
                { key: 'type', label: 'Post Type', required: false, placeholder: 'e.g., carousel, story, reel' },
                ...(currentPlatform?.id === 'instagram' ? [
                  { key: 'hashtags', label: 'Hashtags (comma-separated)', required: false, placeholder: '#health #wellness #podcast' }
                ] : []),
              ];

              return (
                <div
                  key={i}
                  className={styles.socialPostItem}
                  style={{ '--platform-accent': currentPlatform?.color }}
                >
                  {editingIndex === i ? (
                    <EditableCard
                      item={{
                        ...post,
                        hashtags: post.hashtags?.join(', ') || '', // Convert array to comma-separated for editing
                      }}
                      fields={socialPostFields}
                      onSave={async (updatedPost) => {
                        // Convert hashtags back to array
                        const hashtagsArray = updatedPost.hashtags
                          ? updatedPost.hashtags.split(',').map(t => t.trim()).filter(t => t)
                          : [];
                        await onUpdateSocialPost(currentPlatform?.stage, currentPlatform?.id, i, {
                          ...updatedPost,
                          hashtags: hashtagsArray.length > 0 ? hashtagsArray : undefined,
                        });
                        setEditingIndex(null);
                      }}
                      onDelete={async () => {
                        await onDeleteSocialPost(currentPlatform?.stage, currentPlatform?.id, i);
                      }}
                      canDelete={currentPosts.length > 1}
                      itemId={`social-${currentPlatform?.id}-${i}`}
                      deleteConfirmText="Are you sure you want to delete this post?"
                    />
                  ) : (
                    <>
                      <div className={styles.postHeader}>
                        {post.type && (
                          <Badge variant="secondary" className={styles.postType}>
                            {post.type}
                          </Badge>
                        )}
                        {/* Library status badge only - scheduled shown in actions */}
                        {libraryItem && (
                          <Badge variant="success" className={styles.statusBadge}>
                            <CheckCircle size={10} />
                            In Library
                          </Badge>
                        )}
                      </div>
                      <p className={styles.socialPost}>{post.content}</p>
                      {post.hashtags && post.hashtags.length > 0 && (
                        <p className={styles.hashtags}>{post.hashtags.join(' ')}</p>
                      )}
                      <div className={styles.postActions}>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={Edit3}
                          onClick={() => setEditingIndex(i)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={copied === `${activePlatform}-${i}` ? Check : Copy}
                          onClick={() => onCopy(post.content, `${activePlatform}-${i}`)}
                        >
                          {copied === `${activePlatform}-${i}` ? 'Copied!' : 'Copy'}
                        </Button>
                        {currentPosts.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={Trash2}
                            onClick={() => onDeleteSocialPost(currentPlatform?.stage, currentPlatform?.id, i)}
                            loading={savingState?.[`social-delete-${currentPlatform?.id}-${i}`]}
                          >
                            Delete
                          </Button>
                        )}
                        <Button
                          variant={libraryItem ? 'secondary' : 'ghost'}
                          size="sm"
                          leftIcon={libraryItem ? CheckCircle : Bookmark}
                          onClick={() => !libraryItem && onSaveToLibrary(libraryData)}
                          disabled={!!libraryItem}
                          title={libraryItem ? 'Already in library' : 'Save to library'}
                        >
                          {libraryItem ? 'Saved' : 'Save'}
                        </Button>
                        {calendarItem ? (
                          <div className={styles.scheduledActions}>
                            <Badge variant="primary" className={styles.scheduledBadge}>
                              <Calendar size={10} />
                              {formatScheduledDate(calendarItem.scheduled_date)}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={Calendar}
                              onClick={() => onReschedule(calendarItem, postData)}
                              title="Change scheduled date"
                            >
                              Reschedule
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={CalendarX}
                              onClick={() => onUnschedule(calendarItem.id)}
                              loading={unscheduling === calendarItem.id}
                              title="Remove from schedule"
                            >
                              Unschedule
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={Calendar}
                            onClick={() => onSchedule(postData)}
                            title="Schedule content"
                          >
                            Schedule
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * EmailTab - Displays email campaign content from Stage 9
 * Supports inline editing and deletion of subject lines, preview text, and email body
 *
 * Stage 9 output structure:
 * - subject_lines: array of strings (5 email subject options, <50 chars)
 * - preview_text: array of strings (3 preview text options, 40-90 chars)
 * - email_body: string (full email body in markdown, 200-350 words)
 * - followup_email: string (optional follow-up email, 100-150 words)
 */
function EmailTab({ stage, onCopy, copied, onSaveToLibrary, onSchedule, onReschedule, onUnschedule, unscheduling, episodeTitle, getLibraryStatus, getCalendarStatus, onUpdateEmailContent, onDeleteEmailItem, savingState }) {
  const [editingSubjectIndex, setEditingSubjectIndex] = useState(null);
  const [editingPreviewIndex, setEditingPreviewIndex] = useState(null);
  const [editingEmailBody, setEditingEmailBody] = useState(false);
  const [editingFollowup, setEditingFollowup] = useState(false);
  const [editValue, setEditValue] = useState('');

  console.log('[EmailTab] Stage 9 data:', {
    hasStage: !!stage,
    stageStatus: stage?.status,
    hasOutputData: !!stage?.output_data,
    emailFields: stage?.output_data ? Object.keys(stage.output_data) : [],
  });

  // Get email content for status check
  const email = stage?.output_data;
  const emailContent = email?.email_body || '';
  const libraryItem = emailContent ? getLibraryStatus('email', null, emailContent) : null;
  const calendarItem = emailContent ? getCalendarStatus('email', null, emailContent) : null;

  // Format scheduled date for display
  const formatScheduledDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Start editing a subject line
  const handleStartEditSubject = (index) => {
    console.log('[EmailTab] Starting edit for subject line', index);
    setEditingSubjectIndex(index);
    setEditValue(email.subject_lines[index] || '');
  };

  // Start editing a preview text
  const handleStartEditPreview = (index) => {
    console.log('[EmailTab] Starting edit for preview text', index);
    setEditingPreviewIndex(index);
    setEditValue(email.preview_text[index] || '');
  };

  // Save edited subject line
  const handleSaveSubject = async (index) => {
    if (!editValue.trim()) {
      console.warn('[EmailTab] Cannot save empty subject line');
      return;
    }
    try {
      await onUpdateEmailContent(stage, 'subject_lines', index, editValue.trim());
      setEditingSubjectIndex(null);
      setEditValue('');
    } catch (err) {
      console.error('[EmailTab] Failed to save subject line:', err);
    }
  };

  // Save edited preview text
  const handleSavePreview = async (index) => {
    if (!editValue.trim()) {
      console.warn('[EmailTab] Cannot save empty preview text');
      return;
    }
    try {
      await onUpdateEmailContent(stage, 'preview_text', index, editValue.trim());
      setEditingPreviewIndex(null);
      setEditValue('');
    } catch (err) {
      console.error('[EmailTab] Failed to save preview text:', err);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingSubjectIndex(null);
    setEditingPreviewIndex(null);
    setEditingEmailBody(false);
    setEditingFollowup(false);
    setEditValue('');
  };

  // Handle keyboard events
  const handleKeyDown = (e, onSave) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  if (!stage) {
    return <EmptyState message="No email content generated" details="Stage 9 (Email Campaign) not found." />;
  }

  if (stage.status !== 'completed') {
    return <EmptyState message="Email content not ready" details={`Stage 9 status: ${stage.status}`} />;
  }

  if (!email) {
    return <EmptyState message="No email content generated" details="Stage 9 completed but has no output data." />;
  }

  return (
    <div className={styles.tabContent}>
      {/* Subject Lines */}
      {email.subject_lines && email.subject_lines.length > 0 && (
        <Card title="Subject Lines" subtitle="Email subject options" padding="lg">
          <div className={styles.subjectLines}>
            {email.subject_lines.map((subject, i) => (
              <div key={i} className={styles.subjectItem}>
                {editingSubjectIndex === i ? (
                  <div className={styles.titleEditGroup}>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, () => handleSaveSubject(i))}
                      className={styles.titleInput}
                      autoFocus
                      maxLength={80}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={Check}
                      onClick={() => handleSaveSubject(i)}
                      loading={savingState?.[`email-subject_lines-${i}`]}
                      disabled={!editValue.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={X}
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <span>{subject}</span>
                    <div className={styles.cardActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={Edit3}
                        onClick={() => handleStartEditSubject(i)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={copied === `subject-${i}` ? Check : Copy}
                        onClick={() => onCopy(subject, `subject-${i}`)}
                      >
                        {copied === `subject-${i}` ? 'Copied!' : 'Copy'}
                      </Button>
                      {email.subject_lines.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={Trash2}
                          onClick={() => onDeleteEmailItem(stage, 'subject_lines', i)}
                          loading={savingState?.[`email-delete-subject_lines-${i}`]}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Preview Text - Now an array */}
      {email.preview_text && email.preview_text.length > 0 && (
        <Card title="Preview Text" subtitle="Email preview line options" padding="lg">
          <div className={styles.previewTextList}>
            {email.preview_text.map((text, i) => (
              <div key={i} className={styles.previewItem}>
                {editingPreviewIndex === i ? (
                  <div className={styles.titleEditGroup}>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, () => handleSavePreview(i))}
                      className={styles.titleInput}
                      autoFocus
                      maxLength={120}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={Check}
                      onClick={() => handleSavePreview(i)}
                      loading={savingState?.[`email-preview_text-${i}`]}
                      disabled={!editValue.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={X}
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <span>{text}</span>
                    <div className={styles.cardActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={Edit3}
                        onClick={() => handleStartEditPreview(i)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={copied === `preview-${i}` ? Check : Copy}
                        onClick={() => onCopy(text, `preview-${i}`)}
                      >
                        {copied === `preview-${i}` ? 'Copied!' : 'Copy'}
                      </Button>
                      {email.preview_text.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={Trash2}
                          onClick={() => onDeleteEmailItem(stage, 'preview_text', i)}
                          loading={savingState?.[`email-delete-preview_text-${i}`]}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Email Body - Note: field is email_body, not body_content */}
      {email.email_body && (() => {
        const emailData = {
          title: `${episodeTitle} - Email Campaign`,
          content_type: 'email',
          platform: null,
          content: email.email_body,
          metadata: {
            subject_lines: email.subject_lines,
            preview_text: email.preview_text,
          },
        };

        const libraryData = {
          title: `${episodeTitle} - Email`,
          content_type: 'email',
          platform: null,
          content: email.email_body,
          source_stage: 9,
          metadata: {
            subject_lines: email.subject_lines,
            preview_text: email.preview_text,
          },
        };

        // Start editing email body
        const handleStartEditBody = () => {
          console.log('[EmailTab] Starting edit for email body');
          setEditingEmailBody(true);
          setEditValue(email.email_body);
        };

        // Save edited email body
        const handleSaveEmailBody = async () => {
          if (!editValue.trim()) {
            console.warn('[EmailTab] Cannot save empty email body');
            return;
          }
          try {
            await onUpdateEmailContent(stage, 'email_body', null, editValue.trim());
            setEditingEmailBody(false);
            setEditValue('');
          } catch (err) {
            console.error('[EmailTab] Failed to save email body:', err);
          }
        };

        return (
          <Card
            title="Email Body"
            subtitle="Main newsletter content"
            headerAction={
              editingEmailBody ? (
                <div className={styles.cardActions}>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={Save}
                    onClick={handleSaveEmailBody}
                    loading={savingState?.['email-email_body']}
                    disabled={!editValue.trim()}
                  >
                    Save Changes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={X}
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={Edit3}
                  onClick={handleStartEditBody}
                >
                  Edit
                </Button>
              )
            }
            padding="lg"
          >
            {/* Library status indicator - scheduled shown in actions */}
            {libraryItem && !editingEmailBody && (
              <div className={styles.statusIndicators}>
                <Badge variant="success" className={styles.statusBadge}>
                  <CheckCircle size={12} />
                  In Library
                </Badge>
              </div>
            )}
            {editingEmailBody ? (
              <textarea
                className={styles.blogTextarea}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Enter email content..."
                disabled={savingState?.['email-email_body']}
              />
            ) : (
              <pre className={styles.emailBody}>{email.email_body}</pre>
            )}
            {!editingEmailBody && (
              <div className={styles.postActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={copied === 'body' ? Check : Copy}
                  onClick={() => onCopy(email.email_body, 'body')}
                >
                  {copied === 'body' ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  variant={libraryItem ? 'secondary' : 'ghost'}
                  size="sm"
                  leftIcon={libraryItem ? CheckCircle : Bookmark}
                  onClick={() => !libraryItem && onSaveToLibrary(libraryData)}
                  disabled={!!libraryItem}
                  title={libraryItem ? 'Already in library' : 'Save to library'}
                >
                  {libraryItem ? 'In Library' : 'Save'}
                </Button>
                {calendarItem ? (
                  <div className={styles.scheduledActions}>
                    <Badge variant="primary" className={styles.scheduledBadge}>
                      <Calendar size={12} />
                      {formatScheduledDate(calendarItem.scheduled_date)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={Calendar}
                      onClick={() => onReschedule(calendarItem, emailData)}
                      title="Change scheduled date"
                    >
                      Reschedule
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={CalendarX}
                      onClick={() => onUnschedule(calendarItem.id)}
                      loading={unscheduling === calendarItem.id}
                      title="Remove from schedule"
                    >
                      Unschedule
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={Calendar}
                    onClick={() => onSchedule(emailData)}
                    title="Schedule content"
                  >
                    Schedule
                  </Button>
                )}
              </div>
            )}
          </Card>
        );
      })()}

      {/* Follow-up Email (optional) */}
      {email.followup_email && (() => {
        // Start editing followup
        const handleStartEditFollowup = () => {
          console.log('[EmailTab] Starting edit for followup email');
          setEditingFollowup(true);
          setEditValue(email.followup_email);
        };

        // Save edited followup
        const handleSaveFollowup = async () => {
          if (!editValue.trim()) {
            console.warn('[EmailTab] Cannot save empty followup email');
            return;
          }
          try {
            await onUpdateEmailContent(stage, 'followup_email', null, editValue.trim());
            setEditingFollowup(false);
            setEditValue('');
          } catch (err) {
            console.error('[EmailTab] Failed to save followup email:', err);
          }
        };

        return (
          <Card
            title="Follow-up Email"
            subtitle="Optional follow-up content"
            headerAction={
              editingFollowup ? (
                <div className={styles.cardActions}>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={Save}
                    onClick={handleSaveFollowup}
                    loading={savingState?.['email-followup_email']}
                    disabled={!editValue.trim()}
                  >
                    Save Changes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={X}
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={Edit3}
                  onClick={handleStartEditFollowup}
                >
                  Edit
                </Button>
              )
            }
            padding="lg"
          >
            {editingFollowup ? (
              <textarea
                className={styles.blogTextarea}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Enter follow-up email content..."
                disabled={savingState?.['email-followup_email']}
              />
            ) : (
              <pre className={styles.emailBody}>{email.followup_email}</pre>
            )}
            {!editingFollowup && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={copied === 'followup' ? Check : Copy}
                onClick={() => onCopy(email.followup_email, 'followup')}
              >
                {copied === 'followup' ? 'Copied!' : 'Copy'}
              </Button>
            )}
          </Card>
        );
      })()}
    </div>
  );
}

function EmptyState({ message, details }) {
  return (
    <div className={styles.emptyState}>
      <AlertCircle size={32} />
      <p>{message}</p>
      {details && <p className={styles.emptyStateDetails}>{details}</p>}
    </div>
  );
}

export default ReviewHub;
