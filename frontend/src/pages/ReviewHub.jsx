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
  RefreshCw,
  Check,
  AlertCircle,
  Trash2,
  ArrowLeft,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import { Button, Card, Spinner, Badge, ConfirmDialog } from '@components/shared';
import api from '@utils/api-client';
import styles from './ReviewHub.module.css';

// Tab definitions
const TABS = [
  { id: 'analysis', label: 'Analysis', icon: FileText, stages: [1] },
  { id: 'quotes', label: 'Quotes', icon: Quote, stages: [2] },
  { id: 'titles', label: 'Titles', icon: Type, stages: [3, 4] },
  { id: 'blog', label: 'Blog Post', icon: AlignLeft, stages: [5, 6, 7] },
  { id: 'social', label: 'Social', icon: Share2, stages: [8] },
  { id: 'email', label: 'Email', icon: Mail, stages: [9] },
];

/**
 * ReviewHub page component
 */
function ReviewHub() {
  const { id: episodeId } = useParams();
  const navigate = useNavigate();

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
  const [regenerating, setRegenerating] = useState(null);

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
    } catch (err) {
      console.error('[ReviewHub] Failed to fetch episode:', err);
      setError(err.message || 'Failed to load episode');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Get stage data by stage number
   * @param {number} stageNumber - The stage number (1-9)
   * @returns {Object|undefined} Stage data or undefined if not found
   */
  function getStage(stageNumber) {
    return stages.find((s) => s.stage_number === stageNumber);
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
    const currentTitle = episode?.episode_context?.title || '';
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
  // STAGE HANDLERS
  // ============================================================================

  /**
   * Regenerate a specific stage
   * @param {number} stageNumber - Stage number to regenerate
   */
  async function handleRegenerate(stageNumber) {
    try {
      setRegenerating(stageNumber);
      console.log('[ReviewHub] Regenerating stage:', stageNumber);

      // Find the stage by number to get its ID
      const stage = getStage(stageNumber);
      if (!stage) {
        throw new Error(`Stage ${stageNumber} not found`);
      }

      await api.stages.regenerate(stage.id);
      await fetchEpisode();

      console.log('[ReviewHub] Stage regenerated successfully');
    } catch (err) {
      console.error('[ReviewHub] Failed to regenerate stage:', err);
      setError(err.message || 'Failed to regenerate');
    } finally {
      setRegenerating(null);
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
  const episodeTitle = episode.episode_context?.title || 'Untitled Episode';

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
          <AnalysisTab stage={getStage(1)} />
        )}

        {activeTab === 'quotes' && (
          <QuotesTab
            stage={getStage(2)}
            onCopy={copyToClipboard}
            copied={copied}
          />
        )}

        {activeTab === 'titles' && (
          <TitlesTab
            titleStage={getStage(3)}
            summaryStage={getStage(4)}
            onCopy={copyToClipboard}
            copied={copied}
          />
        )}

        {activeTab === 'blog' && (
          <BlogTab
            outlineStage={getStage(5)}
            draftStage={getStage(6)}
            editedStage={getStage(7)}
            onCopy={copyToClipboard}
            onRegenerate={handleRegenerate}
            copied={copied}
            regenerating={regenerating}
            // Blog editing props
            isEditing={isEditingBlog}
            editedContent={editedBlogContent}
            onEditedContentChange={setEditedBlogContent}
            onStartEdit={handleStartEditBlog}
            onSaveEdit={handleSaveBlog}
            onCancelEdit={handleCancelEditBlog}
            savingEdit={savingBlog}
          />
        )}

        {activeTab === 'social' && (
          <SocialTab
            stage={getStage(8)}
            onCopy={copyToClipboard}
            copied={copied}
          />
        )}

        {activeTab === 'email' && (
          <EmailTab
            stage={getStage(9)}
            onCopy={copyToClipboard}
            copied={copied}
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
    </div>
  );
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function AnalysisTab({ stage }) {
  if (!stage?.output_data) return <EmptyState message="No analysis data" />;

  const data = stage.output_data;

  return (
    <div className={styles.tabContent}>
      <Card title="Episode Crux" padding="lg">
        <p className={styles.crux}>{data.episode_crux}</p>
      </Card>

      <Card title="Key Themes" padding="lg">
        <div className={styles.themesList}>
          {data.key_themes?.map((theme, i) => (
            <div key={i} className={styles.theme}>
              <h4>{theme.theme}</h4>
              <p>{theme.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {data.target_audiences && (
        <Card title="Target Audiences" padding="lg">
          <ul className={styles.list}>
            {data.target_audiences.map((audience, i) => (
              <li key={i}>{audience}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * QuotesTab - Displays extracted quotes from Stage 2
 *
 * Quote structure (from Stage 2):
 * - text: The verbatim quote (required)
 * - speaker: Who said it (required)
 * - context: Why it's significant (optional)
 * - usage: Suggested use - headline/pullquote/social/key_point (optional)
 */
function QuotesTab({ stage, onCopy, copied }) {
  if (!stage?.output_data?.quotes) return <EmptyState message="No quotes extracted" />;

  return (
    <div className={styles.tabContent}>
      {stage.output_data.quotes.map((quote, i) => (
        <Card key={i} padding="lg" className={styles.quoteCard}>
          <blockquote className={styles.quote}>
            "{quote.text}"
          </blockquote>
          <p className={styles.quoteSpeaker}>— {quote.speaker}</p>
          {quote.context && <p className={styles.quoteContext}>{quote.context}</p>}
          {quote.usage && (
            <Badge variant="secondary" className={styles.quoteUsage}>
              {quote.usage}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === `quote-${i}` ? Check : Copy}
            onClick={() => onCopy(quote.text, `quote-${i}`)}
          >
            {copied === `quote-${i}` ? 'Copied!' : 'Copy'}
          </Button>
        </Card>
      ))}
    </div>
  );
}

function TitlesTab({ titleStage, summaryStage, onCopy, copied }) {
  const titles = titleStage?.output_data?.titles || [];
  const summaries = summaryStage?.output_data || {};

  return (
    <div className={styles.tabContent}>
      <Card title="Generated Titles" padding="lg">
        <div className={styles.titlesList}>
          {titles.map((title, i) => (
            <div key={i} className={styles.titleItem}>
              <span className={styles.titleText}>{title.title}</span>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={copied === `title-${i}` ? Check : Copy}
                onClick={() => onCopy(title.title, `title-${i}`)}
              >
                {copied === `title-${i}` ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {summaries.short_summary && (
        <Card title="Short Summary" subtitle="1-2 sentences" padding="lg">
          <p>{summaries.short_summary}</p>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === 'short' ? Check : Copy}
            onClick={() => onCopy(summaries.short_summary, 'short')}
          >
            Copy
          </Button>
        </Card>
      )}

      {summaries.medium_summary && (
        <Card title="Medium Summary" subtitle="Paragraph length" padding="lg">
          <p>{summaries.medium_summary}</p>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === 'medium' ? Check : Copy}
            onClick={() => onCopy(summaries.medium_summary, 'medium')}
          >
            Copy
          </Button>
        </Card>
      )}
    </div>
  );
}

/**
 * BlogTab component with inline editing support
 * Allows viewing, copying, regenerating, and editing the blog post content
 */
function BlogTab({
  outlineStage,
  draftStage,
  editedStage,
  onCopy,
  onRegenerate,
  copied,
  regenerating,
  // Editing props
  isEditing,
  editedContent,
  onEditedContentChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  savingEdit,
}) {
  const blogPost = editedStage?.output_text || draftStage?.output_text;
  // Use editedStage if available, otherwise fall back to draftStage for saving
  const stageToUpdate = editedStage || draftStage;

  return (
    <div className={styles.tabContent}>
      {/* Blog outline section */}
      {outlineStage?.output_data?.outline && (
        <Card title="Outline" padding="lg">
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
                    leftIcon={RefreshCw}
                    loading={regenerating === 7}
                    onClick={() => onRegenerate(7)}
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={copied === 'blog' ? Check : Copy}
                    onClick={() => onCopy(blogPost, 'blog')}
                  >
                    Copy
                  </Button>
                </>
              )}
            </div>
          }
          padding="lg"
        >
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

function SocialTab({ stage, onCopy, copied }) {
  const posts = stage?.output_data?.posts || [];

  return (
    <div className={styles.tabContent}>
      {posts.map((post, i) => (
        <Card
          key={i}
          title={post.platform}
          headerAction={
            <Badge variant="primary">{post.content_type}</Badge>
          }
          padding="lg"
        >
          <p className={styles.socialPost}>{post.content}</p>
          {post.hashtags && (
            <p className={styles.hashtags}>{post.hashtags.join(' ')}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === `social-${i}` ? Check : Copy}
            onClick={() => onCopy(post.content, `social-${i}`)}
          >
            Copy
          </Button>
        </Card>
      ))}
    </div>
  );
}

function EmailTab({ stage, onCopy, copied }) {
  const email = stage?.output_data;

  if (!email) return <EmptyState message="No email content" />;

  return (
    <div className={styles.tabContent}>
      <Card title="Subject Lines" padding="lg">
        <div className={styles.subjectLines}>
          {email.subject_lines?.map((subject, i) => (
            <div key={i} className={styles.subjectItem}>
              <span>{subject}</span>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={copied === `subject-${i}` ? Check : Copy}
                onClick={() => onCopy(subject, `subject-${i}`)}
              >
                Copy
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {email.preview_text && (
        <Card title="Preview Text" padding="lg">
          <p>{email.preview_text}</p>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === 'preview' ? Check : Copy}
            onClick={() => onCopy(email.preview_text, 'preview')}
          >
            Copy
          </Button>
        </Card>
      )}

      {email.body_content && (
        <Card title="Email Body" padding="lg">
          <pre className={styles.emailBody}>{email.body_content}</pre>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={copied === 'body' ? Check : Copy}
            onClick={() => onCopy(email.body_content, 'body')}
          >
            Copy
          </Button>
        </Card>
      )}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className={styles.emptyState}>
      <AlertCircle size={32} />
      <p>{message}</p>
    </div>
  );
}

export default ReviewHub;
