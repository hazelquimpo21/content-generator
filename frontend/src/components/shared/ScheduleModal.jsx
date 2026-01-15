/**
 * ============================================================================
 * SCHEDULE MODAL COMPONENT
 * ============================================================================
 * Modal for scheduling content to the calendar.
 * Allows users to select date, time, and set status.
 * Can also be used to edit existing scheduled items.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import styles from './ScheduleModal.module.css';

/**
 * Generate calendar days for a given month
 */
function generateCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days = [];

  // Add empty cells for days before the first of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  return days;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD to Date object
 */
function parseDate(dateString) {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Month names for display
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Day names for calendar header
 */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * ScheduleModal component
 */
function ScheduleModal({
  isOpen,
  onClose,
  onSchedule,
  initialData = {},
  title = 'Schedule Content',
  loading = false,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calendar state
  const [viewDate, setViewDate] = useState(() => {
    if (initialData.scheduled_date) {
      const date = parseDate(initialData.scheduled_date);
      return { year: date.getFullYear(), month: date.getMonth() };
    }
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  // Form state
  const [selectedDate, setSelectedDate] = useState(initialData.scheduled_date || '');
  const [selectedTime, setSelectedTime] = useState(initialData.scheduled_time || '');
  const [status, setStatus] = useState(initialData.status || 'scheduled');
  const [notes, setNotes] = useState(initialData.notes || '');

  // Reset form when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setSelectedDate(initialData.scheduled_date || '');
      setSelectedTime(initialData.scheduled_time || '');
      setStatus(initialData.status || 'scheduled');
      setNotes(initialData.notes || '');

      if (initialData.scheduled_date) {
        const date = parseDate(initialData.scheduled_date);
        setViewDate({ year: date.getFullYear(), month: date.getMonth() });
      } else {
        setViewDate({ year: today.getFullYear(), month: today.getMonth() });
      }
    }
  }, [isOpen, initialData.scheduled_date, initialData.scheduled_time, initialData.status, initialData.notes]);

  // Navigate months
  const goToPreviousMonth = () => {
    setViewDate((prev) => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { ...prev, month: prev.month - 1 };
    });
  };

  const goToNextMonth = () => {
    setViewDate((prev) => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { ...prev, month: prev.month + 1 };
    });
  };

  // Handle day selection
  const handleDayClick = (day) => {
    if (!day) return;
    const date = new Date(viewDate.year, viewDate.month, day);
    setSelectedDate(formatDate(date));
  };

  // Check if a day is selected
  const isDaySelected = (day) => {
    if (!day || !selectedDate) return false;
    const date = new Date(viewDate.year, viewDate.month, day);
    return formatDate(date) === selectedDate;
  };

  // Check if a day is today
  const isToday = (day) => {
    if (!day) return false;
    const date = new Date(viewDate.year, viewDate.month, day);
    return formatDate(date) === formatDate(today);
  };

  // Check if a day is in the past
  const isPast = (day) => {
    if (!day) return false;
    const date = new Date(viewDate.year, viewDate.month, day);
    return date < today;
  };

  // Handle form submit
  const handleSubmit = () => {
    if (!selectedDate) return;

    onSchedule({
      scheduled_date: selectedDate,
      scheduled_time: selectedTime || null,
      status,
      notes: notes.trim() || null,
    });
  };

  // Generate calendar days
  const calendarDays = generateCalendarDays(viewDate.year, viewDate.month);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedDate || loading}
            loading={loading}
          >
            {initialData.id ? 'Update Schedule' : 'Schedule'}
          </Button>
        </>
      }
    >
      <div className={styles.content}>
        {/* Calendar Section */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>
            <Calendar size={16} />
            Select Date
          </label>

          <div className={styles.calendar}>
            {/* Calendar Header */}
            <div className={styles.calendarHeader}>
              <button
                type="button"
                className={styles.navButton}
                onClick={goToPreviousMonth}
                aria-label="Previous month"
              >
                <ChevronLeft size={20} />
              </button>

              <span className={styles.monthYear}>
                {MONTH_NAMES[viewDate.month]} {viewDate.year}
              </span>

              <button
                type="button"
                className={styles.navButton}
                onClick={goToNextMonth}
                aria-label="Next month"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Day Names */}
            <div className={styles.dayNames}>
              {DAY_NAMES.map((day) => (
                <div key={day} className={styles.dayName}>
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className={styles.calendarGrid}>
              {calendarDays.map((day, index) => (
                <button
                  key={index}
                  type="button"
                  className={clsx(
                    styles.dayCell,
                    !day && styles.empty,
                    isDaySelected(day) && styles.selected,
                    isToday(day) && styles.today,
                    isPast(day) && styles.past
                  )}
                  onClick={() => handleDayClick(day)}
                  disabled={!day || isPast(day)}
                  aria-label={day ? `${MONTH_NAMES[viewDate.month]} ${day}, ${viewDate.year}` : undefined}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Time Section */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>
            <Clock size={16} />
            Select Time (Optional)
          </label>

          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className={styles.timeInput}
          />
        </div>

        {/* Status Section */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>Status</label>

          <div className={styles.statusOptions}>
            <label className={clsx(styles.statusOption, status === 'draft' && styles.active)}>
              <input
                type="radio"
                name="status"
                value="draft"
                checked={status === 'draft'}
                onChange={(e) => setStatus(e.target.value)}
              />
              <span className={styles.statusLabel}>Draft</span>
              <span className={styles.statusDesc}>Not finalized yet</span>
            </label>

            <label className={clsx(styles.statusOption, status === 'scheduled' && styles.active)}>
              <input
                type="radio"
                name="status"
                value="scheduled"
                checked={status === 'scheduled'}
                onChange={(e) => setStatus(e.target.value)}
              />
              <span className={styles.statusLabel}>Scheduled</span>
              <span className={styles.statusDesc}>Ready to publish</span>
            </label>
          </div>
        </div>

        {/* Notes Section */}
        <div className={styles.section}>
          <Input
            label="Notes (Optional)"
            multiline
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about this scheduled content..."
          />
        </div>

        {/* Selected Date Summary */}
        {selectedDate && (
          <div className={styles.summary}>
            <span className={styles.summaryLabel}>Scheduled for:</span>
            <span className={styles.summaryValue}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {selectedTime && ` at ${selectedTime}`}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ScheduleModal;
