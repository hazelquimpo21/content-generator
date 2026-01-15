/**
 * ============================================================================
 * CONTENT LIBRARY PAGE
 * ============================================================================
 * Displays all saved content items with filtering, search, and actions.
 * Users can view, edit, delete, and schedule library items.
 *
 * Features:
 * - Filter by content type, platform, and topic
 * - Search by title and content
 * - View favorites
 * - Quick actions: schedule, edit, delete
 * - View full content in modal
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  BookOpen,
  MessageSquare,
  Mail,
  Bookmark,
  Star,
  Calendar,
  Trash2,
  Eye,
  AlertCircle,
  ChevronRight,
  Tag,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button, Card, Badge, Spinner, Modal, ConfirmDialog, useToast } from '@components/shared';
import ScheduleModal from '@components/shared/ScheduleModal';
import api from '@utils/api-client';
import styles from './ContentLibrary.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTENT_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types', icon: Bookmark },
  { value: 'blog', label: 'Blog Posts', icon: BookOpen },
  { value: 'social', label: 'Social Posts', icon: MessageSquare },
  { value: 'email', label: 'Emails', icon: Mail },
];

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All Platforms' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
];

const CONTENT_TYPE_ICONS = {
  blog: BookOpen,
  social: MessageSquare,
  email: Mail,
  headline: BookOpen,
  quote: MessageSquare,
};

const PLATFORM_COLORS = {
  instagram: '#E4405F',
  twitter: '#1DA1F2',
  linkedin: '#0A66C2',
  facebook: '#1877F2',
  generic: 'var(--color-text-tertiary)',
};

/**
 * ContentLibrary page component
 */
function ContentLibrary() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // List state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);

  // Filter state
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [favoriteFilter, setFavoriteFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState('all');

  // Topics for filtering
  const [availableTopics, setAvailableTopics] = useState([]);

  // Stats state
  const [stats, setStats] = useState(null);

  // Modal state
  const [viewItem, setViewItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Fetch items on mount and filter change
  useEffect(() => {
    fetchItems();
  }, [contentTypeFilter, platformFilter, favoriteFilter, searchQuery, topicFilter]);

  // Fetch stats and topics on mount
  useEffect(() => {
    fetchStats();
    fetchTopics();
  }, []);

  /**
   * Fetch available topics for filtering
   */
  async function fetchTopics() {
    try {
      const data = await api.topics.list();
      setAvailableTopics(data.topics || []);
    } catch (err) {
      console.error('[ContentLibrary] Failed to fetch topics:', err);
    }
  }

  /**
   * Fetch library items from API
   */
  async function fetchItems() {
    try {
      setLoading(true);
      setError(null);

      const params = {
        limit: 50,
        offset: 0,
      };

      if (contentTypeFilter !== 'all') {
        params.content_type = contentTypeFilter;
      }
      if (platformFilter !== 'all') {
        params.platform = platformFilter;
      }
      if (favoriteFilter) {
        params.favorite = 'true';
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      if (topicFilter !== 'all') {
        params.topic_id = topicFilter;
      }

      const data = await api.library.list(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('[ContentLibrary] Failed to fetch items:', err);
      setError(err.message || 'Failed to load library items');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fetch library statistics
   */
  async function fetchStats() {
    try {
      const data = await api.library.stats();
      setStats(data.stats);
    } catch (err) {
      console.error('[ContentLibrary] Failed to fetch stats:', err);
    }
  }

  /**
   * Handle favorite toggle
   */
  async function handleToggleFavorite(e, item) {
    e.stopPropagation();
    try {
      const result = await api.library.toggleFavorite(item.id);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_favorite: result.is_favorite } : i
        )
      );
      showToast({
        message: result.is_favorite ? 'Added to favorites' : 'Removed from favorites',
        variant: 'success',
      });
    } catch (err) {
      console.error('[ContentLibrary] Failed to toggle favorite:', err);
      showToast({
        message: 'Failed to update favorite status',
        variant: 'error',
      });
    }
  }

  /**
   * Handle schedule click
   */
  function handleScheduleClick(e, item) {
    e.stopPropagation();
    setScheduleTarget(item);
  }

  /**
   * Handle schedule submit
   */
  async function handleScheduleSubmit(scheduleData) {
    if (!scheduleTarget) return;

    try {
      setScheduleLoading(true);

      // Create calendar item from library item
      await api.calendar.create({
        title: scheduleTarget.title,
        content_type: scheduleTarget.content_type,
        platform: scheduleTarget.platform,
        full_content: scheduleTarget.content,
        library_item_id: scheduleTarget.id,
        episode_id: scheduleTarget.episode_id,
        metadata: scheduleTarget.metadata,
        topic_ids: scheduleTarget.topic_ids,
        ...scheduleData,
      });

      showToast({
        message: 'Content scheduled!',
        description: `Scheduled for ${scheduleData.scheduled_date}`,
        variant: 'success',
        action: () => navigate('/calendar'),
        actionLabel: 'View calendar',
      });

      setScheduleTarget(null);
    } catch (err) {
      console.error('[ContentLibrary] Failed to schedule content:', err);
      showToast({
        message: 'Failed to schedule content',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setScheduleLoading(false);
    }
  }

  /**
   * Handle delete click
   */
  function handleDeleteClick(e, item) {
    e.stopPropagation();
    setDeleteTarget(item);
  }

  /**
   * Handle delete confirm
   */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    try {
      await api.library.delete(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      showToast({
        message: 'Item deleted',
        variant: 'success',
      });
      setDeleteTarget(null);
    } catch (err) {
      console.error('[ContentLibrary] Failed to delete item:', err);
      showToast({
        message: 'Failed to delete item',
        variant: 'error',
      });
      throw err;
    }
  }

  /**
   * Get topic names for an item
   */
  function getTopicNames(topicIds) {
    if (!topicIds || topicIds.length === 0) return [];
    return topicIds
      .map((id) => availableTopics.find((t) => t.id === id)?.name)
      .filter(Boolean);
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Content Library</h1>
          <p className={styles.subtitle}>
            Your saved content pieces, ready to use or schedule
          </p>
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.total_items}</span>
            <span className={styles.statLabel}>Total Items</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.blog_count}</span>
            <span className={styles.statLabel}>Blog Posts</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.social_count}</span>
            <span className={styles.statLabel}>Social Posts</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.favorite_count}</span>
            <span className={styles.statLabel}>Favorites</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={styles.filters}>
        {/* Search */}
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Content type filter */}
        <div className={styles.filterGroup}>
          <Filter className={styles.filterIcon} />
          <select
            value={contentTypeFilter}
            onChange={(e) => setContentTypeFilter(e.target.value)}
            className={styles.filterSelect}
          >
            {CONTENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Platform filter */}
        <div className={styles.filterGroup}>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className={styles.filterSelect}
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Topic filter */}
        {availableTopics.length > 0 && (
          <div className={styles.filterGroup}>
            <Tag className={styles.filterIcon} size={16} />
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Topics</option>
              {availableTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Favorites toggle */}
        <button
          className={`${styles.favoriteToggle} ${favoriteFilter ? styles.active : ''}`}
          onClick={() => setFavoriteFilter(!favoriteFilter)}
          title="Show favorites only"
        >
          <Star size={16} />
          Favorites
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner centered text="Loading library..." />
      ) : error ? (
        <Card className={styles.errorCard}>
          <AlertCircle className={styles.errorIcon} />
          <p className={styles.errorText}>{error}</p>
          <Button variant="secondary" onClick={fetchItems}>
            Try Again
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card className={styles.emptyCard}>
          <div className={styles.emptyContent}>
            <Bookmark size={48} className={styles.emptyIcon} />
            <h3>No content saved yet</h3>
            <p>
              {searchQuery || contentTypeFilter !== 'all' || platformFilter !== 'all' || favoriteFilter || topicFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Save content from the Review Hub to build your library'}
            </p>
            {!searchQuery && contentTypeFilter === 'all' && platformFilter === 'all' && !favoriteFilter && topicFilter === 'all' && (
              <Button onClick={() => navigate('/')}>
                Go to Episodes
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              topicNames={getTopicNames(item.topic_ids)}
              onClick={() => setViewItem(item)}
              onToggleFavorite={handleToggleFavorite}
              onSchedule={handleScheduleClick}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {/* View Content Modal */}
      <Modal
        isOpen={!!viewItem}
        onClose={() => setViewItem(null)}
        title={viewItem?.title}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewItem(null)}>
              Close
            </Button>
            <Button
              leftIcon={Calendar}
              onClick={() => {
                setScheduleTarget(viewItem);
                setViewItem(null);
              }}
            >
              Schedule
            </Button>
          </>
        }
      >
        {viewItem && (
          <div className={styles.viewContent}>
            <div className={styles.viewMeta}>
              <Badge>{viewItem.content_type}</Badge>
              {viewItem.platform && (
                <Badge variant="secondary">{viewItem.platform}</Badge>
              )}
              {getTopicNames(viewItem.topic_ids).length > 0 && (
                <div className={styles.viewTags}>
                  {getTopicNames(viewItem.topic_ids).map((name) => (
                    <span key={name} className={styles.viewTag}>
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {viewItem.tags?.length > 0 && (
                <div className={styles.viewTags}>
                  {viewItem.tags.map((tag) => (
                    <span key={tag} className={styles.viewTag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.viewText}>{viewItem.content}</div>
          </div>
        )}
      </Modal>

      {/* Schedule Modal */}
      <ScheduleModal
        isOpen={!!scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        onSchedule={handleScheduleSubmit}
        loading={scheduleLoading}
        title={`Schedule: ${scheduleTarget?.title || 'Content'}`}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete from Library"
        message={`Are you sure you want to delete "${deleteTarget?.title}"?`}
        description="This action cannot be undone. The content will be permanently removed from your library."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}

/**
 * Library card component
 */
function LibraryCard({ item, topicNames = [], onClick, onToggleFavorite, onSchedule, onDelete }) {
  const Icon = CONTENT_TYPE_ICONS[item.content_type] || Bookmark;
  const createdAt = item.created_at
    ? format(new Date(item.created_at), 'MMM d, yyyy')
    : '';

  // Get content preview (first 150 chars)
  const contentPreview =
    item.content.length > 150
      ? item.content.substring(0, 147) + '...'
      : item.content;

  return (
    <Card className={styles.libraryCard} hoverable onClick={onClick} padding="md">
      <div className={styles.cardHeader}>
        <div className={styles.cardType}>
          <Icon size={14} />
          {item.content_type}
          {item.platform && (
            <span
              className={styles.platformDot}
              style={{ backgroundColor: PLATFORM_COLORS[item.platform] }}
              title={item.platform}
            />
          )}
        </div>
        <button
          className={`${styles.favoriteButton} ${item.is_favorite ? styles.active : ''}`}
          onClick={(e) => onToggleFavorite(e, item)}
          title={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star size={14} />
        </button>
      </div>

      <h3 className={styles.cardTitle}>{item.title}</h3>

      <p className={styles.cardPreview}>{contentPreview}</p>

      {/* Display topic names */}
      {topicNames.length > 0 && (
        <div className={styles.cardTags}>
          {topicNames.slice(0, 3).map((name) => (
            <span key={name} className={styles.cardTag}>
              {name}
            </span>
          ))}
          {topicNames.length > 3 && (
            <span className={styles.cardTagMore}>+{topicNames.length - 3}</span>
          )}
        </div>
      )}

      {/* Display free-form tags if no topics */}
      {topicNames.length === 0 && item.tags?.length > 0 && (
        <div className={styles.cardTags}>
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className={styles.cardTag}>
              {tag}
            </span>
          ))}
          {item.tags.length > 3 && (
            <span className={styles.cardTagMore}>+{item.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className={styles.cardFooter}>
        <span className={styles.cardDate}>{createdAt}</span>
        <div className={styles.cardActions}>
          <button
            className={styles.cardAction}
            onClick={(e) => onSchedule(e, item)}
            title="Schedule"
          >
            <Calendar size={14} />
          </button>
          <button
            className={styles.cardAction}
            onClick={(e) => onDelete(e, item)}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </Card>
  );
}

export default ContentLibrary;
