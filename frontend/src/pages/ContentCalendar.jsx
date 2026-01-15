/**
 * ============================================================================
 * CONTENT CALENDAR PAGE
 * ============================================================================
 * Displays scheduled content in a monthly calendar view.
 * Users can view, reschedule, and update status of scheduled items.
 *
 * Features:
 * - Monthly calendar view with scheduled items
 * - Navigate between months
 * - Filter by content type, platform, and status
 * - Quick actions: view, reschedule, update status, delete
 * - View full content in modal
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  BookOpen,
  MessageSquare,
  Mail,
  Eye,
  Edit3,
  Trash2,
  Check,
  X,
  Clock,
  AlertCircle,
  Plus,
  Instagram,
  Twitter,
  Linkedin,
  Facebook,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { Button, Card, Badge, Spinner, Modal, ConfirmDialog, useToast, LibraryPickerModal } from '@components/shared';
import ScheduleModal from '@components/shared/ScheduleModal';
import api from '@utils/api-client';
import styles from './ContentCalendar.module.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CONTENT_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'blog', label: 'Blog Posts' },
  { value: 'social', label: 'Social Posts' },
  { value: 'email', label: 'Emails' },
];

// Content type configuration with icons and colors
const CONTENT_TYPE_CONFIG = {
  blog: {
    icon: BookOpen,
    label: 'Blog',
    color: 'var(--color-sage)',
    bgColor: 'var(--color-sage-light)',
  },
  social: {
    icon: MessageSquare,
    label: 'Social',
    color: 'var(--color-primary)',
    bgColor: 'var(--color-primary-light)',
  },
  email: {
    icon: Mail,
    label: 'Email',
    color: 'var(--color-amber)',
    bgColor: 'var(--color-amber-light)',
  },
};

// Platform configuration with icons and colors
const PLATFORM_CONFIG = {
  instagram: { icon: Instagram, label: 'IG', color: '#E4405F', bgColor: '#FCE4EC' },
  twitter: { icon: Twitter, label: 'X', color: '#1DA1F2', bgColor: '#E3F2FD' },
  linkedin: { icon: Linkedin, label: 'LI', color: '#0A66C2', bgColor: '#E8EAF6' },
  facebook: { icon: Facebook, label: 'FB', color: '#1877F2', bgColor: '#E3F2FD' },
  generic: { icon: MessageSquare, label: '', color: 'var(--color-text-tertiary)', bgColor: 'var(--color-bg-tertiary)' },
};

const STATUS_COLORS = {
  draft: 'var(--color-text-tertiary)',
  scheduled: 'var(--color-primary)',
  published: 'var(--color-success)',
  cancelled: 'var(--color-error)',
};

/**
 * ContentCalendar page component
 */
function ContentCalendar() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');

  // Modal state
  const [viewItem, setViewItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Library picker state
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState(null);
  const [scheduleFromLibrary, setScheduleFromLibrary] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Fetch items when month or filters change
  useEffect(() => {
    fetchItems();
  }, [currentMonth, statusFilter, contentTypeFilter]);

  /**
   * Fetch calendar items for current month
   */
  async function fetchItems() {
    try {
      setLoading(true);
      setError(null);

      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const params = {
        start_date: format(monthStart, 'yyyy-MM-dd'),
        end_date: format(monthEnd, 'yyyy-MM-dd'),
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (contentTypeFilter !== 'all') {
        params.content_type = contentTypeFilter;
      }

      const data = await api.calendar.list(params);
      setItems(data.items || []);
    } catch (err) {
      console.error('[ContentCalendar] Failed to fetch items:', err);
      setError(err.message || 'Failed to load calendar items');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Navigate to previous month
   */
  function goToPreviousMonth() {
    setCurrentMonth(subMonths(currentMonth, 1));
  }

  /**
   * Navigate to next month
   */
  function goToNextMonth() {
    setCurrentMonth(addMonths(currentMonth, 1));
  }

  /**
   * Navigate to current month
   */
  function goToToday() {
    setCurrentMonth(new Date());
  }

  /**
   * Get items for a specific day
   */
  function getItemsForDay(day) {
    return items.filter((item) => {
      const itemDate = new Date(item.scheduled_date + 'T00:00:00');
      return isSameDay(itemDate, day);
    });
  }

  /**
   * Handle status update
   */
  async function handleStatusUpdate(item, newStatus) {
    try {
      const result = await api.calendar.updateStatus(item.id, {
        status: newStatus,
      });

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: result.item.status } : i
        )
      );

      showToast({
        message: `Status updated to ${newStatus}`,
        variant: 'success',
      });
    } catch (err) {
      console.error('[ContentCalendar] Failed to update status:', err);
      showToast({
        message: 'Failed to update status',
        variant: 'error',
      });
    }
  }

  /**
   * Handle reschedule
   */
  async function handleReschedule(scheduleData) {
    if (!editItem) return;

    try {
      setEditLoading(true);

      const result = await api.calendar.update(editItem.id, scheduleData);

      // If date changed, may need to remove from current view
      const newDate = new Date(scheduleData.scheduled_date + 'T00:00:00');
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      if (newDate >= monthStart && newDate <= monthEnd) {
        setItems((prev) =>
          prev.map((i) => (i.id === editItem.id ? result.item : i))
        );
      } else {
        // Item moved to different month
        setItems((prev) => prev.filter((i) => i.id !== editItem.id));
      }

      showToast({
        message: 'Content rescheduled',
        description: `Moved to ${scheduleData.scheduled_date}`,
        variant: 'success',
      });

      setEditItem(null);
    } catch (err) {
      console.error('[ContentCalendar] Failed to reschedule:', err);
      showToast({
        message: 'Failed to reschedule',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setEditLoading(false);
    }
  }

  /**
   * Handle delete
   */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    try {
      await api.calendar.delete(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      showToast({
        message: 'Item deleted',
        variant: 'success',
      });
      setDeleteTarget(null);
    } catch (err) {
      console.error('[ContentCalendar] Failed to delete item:', err);
      showToast({
        message: 'Failed to delete item',
        variant: 'error',
      });
      throw err;
    }
  }

  /**
   * Handle library item selection
   */
  function handleLibraryItemSelect(item) {
    setSelectedLibraryItem(item);
    setShowLibraryPicker(false);
    setScheduleFromLibrary(true);
  }

  /**
   * Handle schedule from library
   */
  async function handleScheduleFromLibrary(scheduleData) {
    if (!selectedLibraryItem) return;

    try {
      setScheduleLoading(true);

      const result = await api.calendar.create({
        title: selectedLibraryItem.title,
        content_type: selectedLibraryItem.content_type,
        platform: selectedLibraryItem.platform,
        full_content: selectedLibraryItem.content,
        content_preview: selectedLibraryItem.content.substring(0, 200),
        library_item_id: selectedLibraryItem.id,
        episode_id: selectedLibraryItem.episode_id,
        metadata: selectedLibraryItem.metadata,
        ...scheduleData,
      });

      // Add to items if in current month view
      const newDate = new Date(scheduleData.scheduled_date + 'T00:00:00');
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      if (newDate >= monthStart && newDate <= monthEnd) {
        setItems((prev) => [...prev, result.item]);
      }

      showToast({
        message: 'Content scheduled!',
        description: `Scheduled for ${scheduleData.scheduled_date}`,
        variant: 'success',
      });

      setScheduleFromLibrary(false);
      setSelectedLibraryItem(null);
    } catch (err) {
      console.error('[ContentCalendar] Failed to schedule from library:', err);
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
   * Generate calendar grid days
   */
  function generateCalendarDays() {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const days = [];
    let day = calendarStart;

    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }

    return days;
  }

  const calendarDays = generateCalendarDays();
  const today = new Date();

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Content Calendar</h1>
          <p className={styles.subtitle}>
            Schedule and manage your content publishing
          </p>
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          <span className={styles.legendTitle}>Content Types:</span>
          <div className={styles.legendItems}>
            {Object.entries(CONTENT_TYPE_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div key={key} className={styles.legendItem}>
                  <span
                    className={styles.legendIcon}
                    style={{ backgroundColor: config.bgColor, color: config.color }}
                  >
                    <Icon size={10} />
                  </span>
                  <span className={styles.legendLabel}>{config.label}</span>
                </div>
              );
            })}
          </div>
          <span className={styles.legendDivider}>|</span>
          <span className={styles.legendTitle}>Platforms:</span>
          <div className={styles.legendItems}>
            {Object.entries(PLATFORM_CONFIG)
              .filter(([key]) => key !== 'generic')
              .map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <div key={key} className={styles.legendItem}>
                    <Icon size={14} style={{ color: config.color }} />
                    <span className={styles.legendLabel}>{config.label}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </header>

      {/* Calendar Controls */}
      <div className={styles.controls}>
        <div className={styles.navigation}>
          <button
            className={styles.navButton}
            onClick={goToPreviousMonth}
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>

          <h2 className={styles.monthTitle}>
            {format(currentMonth, 'MMMM yyyy')}
          </h2>

          <button
            className={styles.navButton}
            onClick={goToNextMonth}
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>

          <Button variant="secondary" size="sm" onClick={goToToday}>
            Today
          </Button>

          <Button
            variant="primary"
            size="sm"
            leftIcon={Plus}
            onClick={() => setShowLibraryPicker(true)}
          >
            Schedule from Library
          </Button>
        </div>

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <Filter className={styles.filterIcon} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.filterSelect}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
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
        </div>
      </div>

      {/* Calendar */}
      {loading ? (
        <Spinner centered text="Loading calendar..." />
      ) : error ? (
        <Card className={styles.errorCard}>
          <AlertCircle className={styles.errorIcon} />
          <p className={styles.errorText}>{error}</p>
          <Button variant="secondary" onClick={fetchItems}>
            Try Again
          </Button>
        </Card>
      ) : (
        <div className={styles.calendar}>
          {/* Day Headers */}
          <div className={styles.dayHeaders}>
            {DAY_NAMES.map((day) => (
              <div key={day} className={styles.dayHeader}>
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className={styles.calendarGrid}>
            {calendarDays.map((day, index) => {
              const dayItems = getItemsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, today);

              return (
                <div
                  key={index}
                  className={`${styles.dayCell} ${!isCurrentMonth ? styles.outsideMonth : ''} ${isToday ? styles.today : ''}`}
                >
                  <div className={styles.dayNumber}>
                    {format(day, 'd')}
                  </div>

                  <div className={styles.dayItems}>
                    {dayItems.slice(0, 3).map((item) => (
                      <CalendarItem
                        key={item.id}
                        item={item}
                        onClick={() => setViewItem(item)}
                      />
                    ))}
                    {dayItems.length > 3 && (
                      <div className={styles.moreItems}>
                        +{dayItems.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View Item Modal */}
      <Modal
        isOpen={!!viewItem}
        onClose={() => setViewItem(null)}
        title={viewItem?.title}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewItem(null)}>
              Close
            </Button>
            <Button
              variant="secondary"
              leftIcon={Edit3}
              onClick={() => {
                setEditItem(viewItem);
                setViewItem(null);
              }}
            >
              Reschedule
            </Button>
            {viewItem?.status !== 'published' && (
              <Button
                leftIcon={Check}
                onClick={() => {
                  handleStatusUpdate(viewItem, 'published');
                  setViewItem(null);
                }}
              >
                Mark Published
              </Button>
            )}
          </>
        }
      >
        {viewItem && (
          <div className={styles.viewContent}>
            <div className={styles.viewMeta}>
              <Badge
                variant={viewItem.status === 'published' ? 'success' : viewItem.status === 'cancelled' ? 'error' : 'default'}
              >
                {viewItem.status}
              </Badge>
              <Badge variant="secondary">{viewItem.content_type}</Badge>
              {viewItem.platform && (
                <Badge variant="secondary">{viewItem.platform}</Badge>
              )}
            </div>

            <div className={styles.viewSchedule}>
              <CalendarIcon size={14} />
              {format(new Date(viewItem.scheduled_date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
              {viewItem.scheduled_time && ` at ${viewItem.scheduled_time}`}
            </div>

            {viewItem.full_content && (
              <div className={styles.viewText}>{viewItem.full_content}</div>
            )}

            {viewItem.notes && (
              <div className={styles.viewNotes}>
                <strong>Notes:</strong> {viewItem.notes}
              </div>
            )}

            <div className={styles.viewActions}>
              <button
                className={styles.viewAction}
                onClick={() => {
                  setDeleteTarget(viewItem);
                  setViewItem(null);
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reschedule Modal */}
      <ScheduleModal
        isOpen={!!editItem}
        onClose={() => setEditItem(null)}
        onSchedule={handleReschedule}
        loading={editLoading}
        title="Reschedule Content"
        initialData={{
          scheduled_date: editItem?.scheduled_date,
          scheduled_time: editItem?.scheduled_time,
          status: editItem?.status,
          notes: editItem?.notes,
          id: editItem?.id,
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Scheduled Item"
        message={`Are you sure you want to delete "${deleteTarget?.title}"?`}
        description="This action cannot be undone. The scheduled item will be permanently removed."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />

      {/* Library Picker Modal */}
      <LibraryPickerModal
        isOpen={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onSelect={handleLibraryItemSelect}
        title="Schedule from Library"
      />

      {/* Schedule from Library Modal */}
      <ScheduleModal
        isOpen={scheduleFromLibrary}
        onClose={() => {
          setScheduleFromLibrary(false);
          setSelectedLibraryItem(null);
        }}
        onSchedule={handleScheduleFromLibrary}
        loading={scheduleLoading}
        title={`Schedule: ${selectedLibraryItem?.title || 'Content'}`}
      />
    </div>
  );
}

/**
 * Calendar item component with enhanced icons
 */
function CalendarItem({ item, onClick }) {
  const typeConfig = CONTENT_TYPE_CONFIG[item.content_type] || CONTENT_TYPE_CONFIG.blog;
  const platformConfig = item.platform ? PLATFORM_CONFIG[item.platform] || PLATFORM_CONFIG.generic : null;
  const statusColor = STATUS_COLORS[item.status] || 'var(--color-text-tertiary)';

  const TypeIcon = typeConfig.icon;
  const PlatformIcon = platformConfig?.icon;

  return (
    <button
      className={styles.calendarItem}
      onClick={onClick}
      style={{ borderLeftColor: statusColor }}
      title={`${item.title} (${typeConfig.label}${platformConfig ? ` - ${platformConfig.label}` : ''})`}
    >
      {/* Content type icon badge */}
      <span
        className={styles.itemTypeBadge}
        style={{ backgroundColor: typeConfig.bgColor, color: typeConfig.color }}
        title={typeConfig.label}
      >
        <TypeIcon size={10} />
      </span>

      {/* Platform icon for social content */}
      {platformConfig && platformConfig.label && (
        <span
          className={styles.itemPlatformBadge}
          style={{ color: platformConfig.color }}
          title={platformConfig.label}
        >
          <PlatformIcon size={11} />
        </span>
      )}

      <span className={styles.itemTitle}>{item.title}</span>

      {item.scheduled_time && (
        <span className={styles.itemTime}>
          {item.scheduled_time.substring(0, 5)}
        </span>
      )}
    </button>
  );
}

export default ContentCalendar;
