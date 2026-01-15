/**
 * ============================================================================
 * TAG MANAGER COMPONENT
 * ============================================================================
 * A component for managing a list of tags/items with add, edit, and delete
 * functionality. Used for topics and content pillars in Settings.
 * ============================================================================
 */

import { useState, useRef, useEffect } from 'react';
import { Plus, X, Check, Edit2, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import styles from './TagManager.module.css';

/**
 * TagManager component for adding/editing/removing tags
 *
 * @param {Object} props
 * @param {Array} props.items - Array of items (each has id, name, and optionally color, description)
 * @param {Function} props.onAdd - Callback when adding new item (receives { name, ...extras })
 * @param {Function} props.onUpdate - Callback when updating item (receives id, { name, ...extras })
 * @param {Function} props.onDelete - Callback when deleting item (receives id)
 * @param {string} props.placeholder - Placeholder text for add input
 * @param {boolean} props.showColors - Whether to show color picker
 * @param {boolean} props.showDescription - Whether to show description field
 * @param {boolean} props.showCount - Whether to show content count badge
 * @param {string} props.emptyMessage - Message when no items
 * @param {boolean} props.loading - Loading state
 * @param {string} props.className - Additional className
 */
function TagManager({
  items = [],
  onAdd,
  onUpdate,
  onDelete,
  placeholder = 'Add new...',
  showColors = false,
  showDescription = false,
  showCount = false,
  emptyMessage = 'No items yet',
  loading = false,
  className,
}) {
  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef(null);
  const editInputRef = useRef(null);

  // Focus input when adding
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Focus edit input when editing
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  /**
   * Handle add submission
   */
  async function handleAdd() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    try {
      await onAdd({ name: trimmed });
      setInputValue('');
      setIsAdding(false);
    } catch (err) {
      console.error('Failed to add item:', err);
    }
  }

  /**
   * Handle add on Enter key
   */
  function handleAddKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setInputValue('');
    }
  }

  /**
   * Handle edit start
   */
  function handleEditStart(item) {
    setEditingId(item.id);
    setEditValue(item.name);
  }

  /**
   * Handle edit submission
   */
  async function handleEditSubmit() {
    const trimmed = editValue.trim();
    if (!trimmed || !editingId) return;

    try {
      await onUpdate(editingId, { name: trimmed });
      setEditingId(null);
      setEditValue('');
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  }

  /**
   * Handle edit on Enter key
   */
  function handleEditKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditValue('');
    }
  }

  /**
   * Handle delete
   */
  async function handleDelete(id) {
    try {
      await onDelete(id);
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  }

  return (
    <div className={clsx(styles.container, className)}>
      {/* Items list */}
      <div className={styles.itemsList}>
        {items.length === 0 && !isAdding ? (
          <p className={styles.emptyMessage}>{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={styles.item}
              style={showColors && item.color ? { borderLeftColor: item.color } : undefined}
            >
              {editingId === item.id ? (
                // Edit mode
                <div className={styles.editRow}>
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    className={styles.editInput}
                  />
                  <button
                    type="button"
                    onClick={handleEditSubmit}
                    className={styles.editAction}
                    title="Save"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditValue('');
                    }}
                    className={styles.editAction}
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                // Display mode
                <>
                  <div className={styles.itemContent}>
                    {showColors && item.color && (
                      <span
                        className={styles.colorDot}
                        style={{ backgroundColor: item.color }}
                      />
                    )}
                    <span className={styles.itemName}>{item.name}</span>
                    {showCount && item.content_count !== undefined && (
                      <span className={styles.countBadge}>
                        {item.content_count}
                      </span>
                    )}
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      onClick={() => handleEditStart(item)}
                      className={styles.actionButton}
                      title="Edit"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className={clsx(styles.actionButton, styles.deleteAction)}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add new item */}
      {isAdding ? (
        <div className={styles.addRow}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder={placeholder}
            className={styles.addInput}
          />
          <button
            type="button"
            onClick={handleAdd}
            className={styles.addAction}
            disabled={!inputValue.trim()}
            title="Add"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setInputValue('');
            }}
            className={styles.addAction}
            title="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className={styles.addButton}
          disabled={loading}
        >
          <Plus size={14} />
          <span>Add {placeholder.toLowerCase().replace('add ', '').replace('new ', '')}</span>
        </button>
      )}
    </div>
  );
}

export default TagManager;
