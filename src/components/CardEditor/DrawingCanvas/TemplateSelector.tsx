// テンプレート選択コンポーネント

import { TEMPLATES } from '../../../data/templates';
import type { Template } from './types';
import styles from './DrawingCanvas.module.css';

interface TemplateSelectorProps {
  selectedTemplate: Template;
  onSelect: (template: Template) => void;
}

export function TemplateSelector({ selectedTemplate, onSelect }: TemplateSelectorProps) {
  return (
    <div className={styles.templateSection}>
      <span className={styles.sectionLabel}>ベース:</span>
      <div className={styles.templateList}>
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            className={`${styles.templateButton} ${selectedTemplate.id === template.id ? styles.active : ''}`}
            onClick={() => onSelect(template)}
          >
            {template.name}
          </button>
        ))}
      </div>
    </div>
  );
}

