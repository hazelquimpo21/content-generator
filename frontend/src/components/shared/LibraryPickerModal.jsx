/**
 * ============================================================================
 * LIBRARY PICKER MODAL COMPONENT
 * ============================================================================
 * Modal for browsing and selecting library items to schedule on the calendar.
 * Provides search, filtering, and preview capabilities.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import {
  Search,
  BookOpen,
  MessageSquare,
  Mail,
  Star,
  Calendar,
  Filter,
  X,
  Instagram,
  Twitter,
  Linkedin,
  Facebook,
} from 'lucide-react';
import clsx from 'clsx';
import Modal from './Modal';
import Button from './Button';
import Spinner from './Spinner';
import Badge from './Badge';
import api from '@utils/api-client';
import styles from './LibraryPickerModal.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTENT_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'blog', label: 'Blog Posts' },
  { value: 'social', label: 'Social Posts' },
  { value: 'email', label: 'Emails' },
];

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All Platforms' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
];

const CONTENT_TYPE_CONFIG = {
  blog: { icon: BookOpen, label: 'Blog', color: 'var(--color-sage)' },
  social: { icon: MessageSquare, label: 'Social', color: 'var(--color-primary)' },
  email: { icon: Mail, label: 'Email', color: 'var(--color-amber)' },
  headline: { icon: BookOpen, label: 'Headline', color: 'var(--color-text-tertiary)' },
  quote: { icon: MessageSquare, label: 'Quote', color: 'var(--color-text-tertiary)' },
};

const PLATFORM_CONFIG = {
  instagram: { icon: Instagram, label: 'Instagram', color: '#E4405F' },
  twitter: { icon: Twitter, label: 'Twitter', color: '#1DA1F2' },
  linkedin: { icon: Linkedin, label: 'LinkedIn', color: '#0A66C2' },
  facebook: { icon: Facebook, label: 'Facebook', color: '#1877F2' },
  generic: { icon: MessageSquare, label: 'Generic', color: 'var(--color-text-tertiary)' },
};

/**
 * LibraryPickerModal component
 */
function LibraryPickerModal({
  isOpen,
  onClose,
  onSelect,
  title = 'Schedule from Library',
  selectedDate = null,
}) {
  // List state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [favoriteFilter, setFavoriteFilter] = useState(false);

  // Selection state
  const [selectedItem, setSelectedItem] = useState(null);

  // Fetch items when filters change
  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen, contentTypeFilter, platformFilter, favoriteFilter, searchQuery]);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedItem(null);
    }
  }, [isOpen]);

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

      const data = await api.library.list(params);
      setItems(data.items || []);
    } catch (err) {
      console.error('[LibraryPickerModal] Failed to fetch items:', err);
      setError(err.message || 'Failed to load library items');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle item selection
   */
  function handleItemClick(item) {
    setSelectedItem(item);
  }

  /**
   * Handle confirm selection
   */
  function handleConfirm() {
    if (selectedItem) {
      onSelect(selectedItem);
    }
  }

  /**
   * Get content type icon and color
   */
  function getContentTypeConfig(contentType) {
    return CONTENT_TYPE_CONFIG[contentType] || CONTENT_TYPE_CONFIG.blog;
  }

  /**
   * Get platform icon and color
   */
  function getPlatformConfig(platform) {
    return PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.generic;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!selectedItem}
            leftIcon={Calendar}
          >
            {selectedDate ? `Schedule for ${selectedDate}` : 'Schedule Selected'}
          </Button>
        </>
      }
    >
      <div className={styles.content}>
        {/* Filters */}
        <div className={styles.filters}>
          {/* Search */}
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} size={16} />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button
                className={styles.searchClear}
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className={styles.filterRow}>
            <div className={styles.filterGroup}>
              <Filter className={styles.filterIcon} size={14} />
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

            <button
              className={clsx(styles.favoriteToggle, favoriteFilter && styles.active)}
              onClick={() => setFavoriteFilter(!favoriteFilter)}
              title="Show favorites only"
            >
              <Star size={14} />
              Favorites
            </button>
          </div>
        </div>

        {/* Items List */}
        <div className={styles.itemsContainer}>
          {loading ? (
            <div className={styles.loadingState}>
              <Spinner size="md" />
              <span>Loading library...</span>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <p>{error}</p>
              <Button variant="secondary" size="sm" onClick={fetchItems}>
                Try Again
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className={styles.emptyState}>
              <BookOpen size={32} className={styles.emptyIcon} />
              <p>No content found</p>
              <span className={styles.emptyHint}>
                {searchQuery || contentTypeFilter !== 'all' || platformFilter !== 'all' || favoriteFilter
                  ? 'Try adjusting your filters'
                  : 'Save content from episodes to build your library'}
              </span>
            </div>
          ) : (
            <div className={styles.itemsList}>
              {items.map((item) => {
                const typeConfig = getContentTypeConfig(item.content_type);
                const platformConfig = item.platform ? getPlatformConfig(item.platform) : null;
                const TypeIcon = typeConfig.icon;
                const PlatformIcon = platformConfig?.icon;

                return (
                  <button
                    key={item.id}
                    className={clsx(
                      styles.itemCard,
                      selectedItem?.id === item.id && styles.selected
                    )}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className={styles.itemHeader}>
                      <div className={styles.itemType}>
                        <span
                          className={styles.typeIconWrapper}
                          style={{ backgroundColor: typeConfig.color }}
                        >
                          <TypeIcon size={12} />
                        </span>
                        <span className={styles.typeLabel}>{typeConfig.label}</span>
                        {platformConfig && (
                          <>
                            <span className={styles.typeSeparator}>/</span>
                            <span
                              className={styles.platformIcon}
                              style={{ color: platformConfig.color }}
                            >
                              <PlatformIcon size={14} />
                            </span>
                            <span className={styles.platformLabel}>{platformConfig.label}</span>
                          </>
                        )}
                      </div>
                      {item.is_favorite && (
                        <Star size={14} className={styles.favoriteIcon} />
                      )}
                    </div>

                    <h4 className={styles.itemTitle}>{item.title}</h4>

                    <p className={styles.itemPreview}>
                      {item.content.length > 120
                        ? item.content.substring(0, 117) + '...'
                        : item.content}
                    </p>

                    {item.tags?.length > 0 && (
                      <div className={styles.itemTags}>
                        {item.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                        {item.tags.length > 3 && (
                          <span className={styles.tagMore}>+{item.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Item Preview */}
        {selectedItem && (
          <div className={styles.preview}>
            <div className={styles.previewHeader}>
              <span className={styles.previewLabel}>Selected:</span>
              <h4 className={styles.previewTitle}>{selectedItem.title}</h4>
            </div>
            <div className={styles.previewContent}>
              {selectedItem.content}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default LibraryPickerModal;
