/**
 * ============================================================================
 * METHOD EDITOR
 * ============================================================================
 * Editor for the Method module - allows users to select their therapeutic
 * modalities and specialties. This helps tailor content to their expertise.
 *
 * Features:
 *   - Multi-select for modalities (CBT, DBT, ACT, etc.)
 *   - Multi-select for specialties (anxiety, trauma, relationships, etc.)
 *   - Search/filter for large lists
 *   - Custom entry for modalities not in the list
 * ============================================================================
 */

import { useState, useCallback, useMemo } from 'react';
import { Save, Search, Check, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { Button, Input } from '@components/shared';
import styles from './MethodEditor.module.css';

/**
 * MethodEditor - Edit therapeutic modalities and specialties
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Current module data
 * @param {Object} props.referenceData - Reference data with modalities/specialties lists
 * @param {Function} props.onSave - Save callback
 * @param {Function} props.onClose - Close callback
 * @param {boolean} props.saving - Whether save is in progress
 * @returns {JSX.Element}
 */
function MethodEditor({ data = {}, referenceData, onSave, onClose, saving }) {
  // Extract reference lists
  const availableModalities = referenceData?.modalities || [];
  const availableSpecialties = referenceData?.specialties || [];

  // State for selections
  const [selectedModalities, setSelectedModalities] = useState(
    data.modalities || []
  );
  const [selectedSpecialties, setSelectedSpecialties] = useState(
    data.specialties || []
  );

  // State for search filters
  const [modalitySearch, setModalitySearch] = useState('');
  const [specialtySearch, setSpecialtySearch] = useState('');

  // State for custom entries
  const [customModality, setCustomModality] = useState('');
  const [customSpecialty, setCustomSpecialty] = useState('');

  const [hasChanges, setHasChanges] = useState(false);

  /**
   * Filter modalities by search term
   */
  const filteredModalities = useMemo(() => {
    if (!modalitySearch.trim()) return availableModalities;
    const search = modalitySearch.toLowerCase();
    return availableModalities.filter(
      (m) =>
        m.name.toLowerCase().includes(search) ||
        m.description?.toLowerCase().includes(search)
    );
  }, [availableModalities, modalitySearch]);

  /**
   * Filter specialties by search term
   */
  const filteredSpecialties = useMemo(() => {
    if (!specialtySearch.trim()) return availableSpecialties;
    const search = specialtySearch.toLowerCase();
    return availableSpecialties.filter(
      (s) =>
        s.name.toLowerCase().includes(search) ||
        s.category?.toLowerCase().includes(search)
    );
  }, [availableSpecialties, specialtySearch]);

  /**
   * Toggle modality selection
   */
  const toggleModality = useCallback((modalityId) => {
    setSelectedModalities((prev) => {
      if (prev.includes(modalityId)) {
        return prev.filter((id) => id !== modalityId);
      }
      return [...prev, modalityId];
    });
    setHasChanges(true);
  }, []);

  /**
   * Toggle specialty selection
   */
  const toggleSpecialty = useCallback((specialtyId) => {
    setSelectedSpecialties((prev) => {
      if (prev.includes(specialtyId)) {
        return prev.filter((id) => id !== specialtyId);
      }
      return [...prev, specialtyId];
    });
    setHasChanges(true);
  }, []);

  /**
   * Add custom modality
   */
  const addCustomModality = useCallback(() => {
    const trimmed = customModality.trim();
    if (!trimmed) return;

    const customId = `custom_${trimmed.toLowerCase().replace(/\s+/g, '_')}`;
    if (!selectedModalities.includes(customId)) {
      setSelectedModalities((prev) => [...prev, customId]);
      setHasChanges(true);
    }
    setCustomModality('');
  }, [customModality, selectedModalities]);

  /**
   * Add custom specialty
   */
  const addCustomSpecialty = useCallback(() => {
    const trimmed = customSpecialty.trim();
    if (!trimmed) return;

    const customId = `custom_${trimmed.toLowerCase().replace(/\s+/g, '_')}`;
    if (!selectedSpecialties.includes(customId)) {
      setSelectedSpecialties((prev) => [...prev, customId]);
      setHasChanges(true);
    }
    setCustomSpecialty('');
  }, [customSpecialty, selectedSpecialties]);

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    const hasSelections =
      selectedModalities.length > 0 || selectedSpecialties.length > 0;
    const newStatus = hasSelections ? 'complete' : 'in_progress';

    console.log('[MethodEditor] Saving:', {
      modalities: selectedModalities,
      specialties: selectedSpecialties,
      status: newStatus,
    });

    try {
      await onSave(
        {
          modalities: selectedModalities,
          specialties: selectedSpecialties,
        },
        newStatus
      );
      setHasChanges(false);
    } catch (err) {
      console.error('[MethodEditor] Save failed:', err);
    }
  }, [selectedModalities, selectedSpecialties, onSave]);

  /**
   * Get display name for an item (handles custom entries)
   */
  const getDisplayName = useCallback(
    (id, list) => {
      if (id.startsWith('custom_')) {
        return id.replace('custom_', '').replace(/_/g, ' ');
      }
      const item = list.find((i) => i.id === id);
      return item?.name || id;
    },
    []
  );

  return (
    <div className={styles.container}>
      {/* Info text */}
      <p className={styles.intro}>
        Select the therapeutic approaches you use and the areas you specialize in.
        This helps us create content that reflects your unique expertise.
      </p>

      <div className={styles.columns}>
        {/* Modalities Column */}
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Therapeutic Modalities</h3>
          <p className={styles.columnSubtitle}>
            Select the approaches you use in your practice
          </p>

          {/* Search */}
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search modalities..."
              value={modalitySearch}
              onChange={(e) => setModalitySearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {/* Selected chips */}
          {selectedModalities.length > 0 && (
            <div className={styles.selectedChips}>
              {selectedModalities.map((id) => (
                <span key={id} className={styles.chip}>
                  {getDisplayName(id, availableModalities)}
                  <button
                    className={styles.chipRemove}
                    onClick={() => toggleModality(id)}
                    aria-label="Remove"
                  >
                    <X className={styles.chipRemoveIcon} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Options list */}
          <div className={styles.optionsList}>
            {filteredModalities.map((modality) => (
              <button
                key={modality.id}
                className={clsx(
                  styles.optionItem,
                  selectedModalities.includes(modality.id) && styles.selected
                )}
                onClick={() => toggleModality(modality.id)}
              >
                <div className={styles.optionContent}>
                  <span className={styles.optionName}>{modality.name}</span>
                  {modality.description && (
                    <span className={styles.optionDescription}>
                      {modality.description}
                    </span>
                  )}
                </div>
                {selectedModalities.includes(modality.id) && (
                  <Check className={styles.checkIcon} />
                )}
              </button>
            ))}
          </div>

          {/* Custom entry */}
          <div className={styles.customEntry}>
            <input
              type="text"
              placeholder="Add custom modality..."
              value={customModality}
              onChange={(e) => setCustomModality(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomModality()}
              className={styles.customInput}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={addCustomModality}
              disabled={!customModality.trim()}
            >
              <Plus className={styles.addIcon} />
            </Button>
          </div>
        </div>

        {/* Specialties Column */}
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Specialties</h3>
          <p className={styles.columnSubtitle}>
            Select the areas you specialize in
          </p>

          {/* Search */}
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search specialties..."
              value={specialtySearch}
              onChange={(e) => setSpecialtySearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {/* Selected chips */}
          {selectedSpecialties.length > 0 && (
            <div className={styles.selectedChips}>
              {selectedSpecialties.map((id) => (
                <span key={id} className={styles.chip}>
                  {getDisplayName(id, availableSpecialties)}
                  <button
                    className={styles.chipRemove}
                    onClick={() => toggleSpecialty(id)}
                    aria-label="Remove"
                  >
                    <X className={styles.chipRemoveIcon} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Options list */}
          <div className={styles.optionsList}>
            {filteredSpecialties.map((specialty) => (
              <button
                key={specialty.id}
                className={clsx(
                  styles.optionItem,
                  selectedSpecialties.includes(specialty.id) && styles.selected
                )}
                onClick={() => toggleSpecialty(specialty.id)}
              >
                <div className={styles.optionContent}>
                  <span className={styles.optionName}>{specialty.name}</span>
                  {specialty.category && (
                    <span className={styles.optionCategory}>
                      {specialty.category}
                    </span>
                  )}
                </div>
                {selectedSpecialties.includes(specialty.id) && (
                  <Check className={styles.checkIcon} />
                )}
              </button>
            ))}
          </div>

          {/* Custom entry */}
          <div className={styles.customEntry}>
            <input
              type="text"
              placeholder="Add custom specialty..."
              value={customSpecialty}
              onChange={(e) => setCustomSpecialty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomSpecialty()}
              className={styles.customInput}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={addCustomSpecialty}
              disabled={!customSpecialty.trim()}
            >
              <Plus className={styles.addIcon} />
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerStats}>
          {selectedModalities.length} modalities, {selectedSpecialties.length}{' '}
          specialties selected
        </div>

        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
            leftIcon={Save}
          >
            Save Method
          </Button>
        </div>
      </div>
    </div>
  );
}

export default MethodEditor;
