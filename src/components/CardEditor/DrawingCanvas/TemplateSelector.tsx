// テンプレート選択コンポーネント

import { useState } from 'react';
import { TEMPLATES } from '../../../data/templates';
import type { Template } from './types';
import styles from './DrawingCanvas.module.css';

interface TemplateSelectorProps {
  selectedTemplate: Template;
  onSelect: (template: Template) => void;
}

export function TemplateSelector({ selectedTemplate, onSelect }: TemplateSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={styles.templateSection}>
      <button 
        className={styles.templateToggle}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>ベース: {selectedTemplate.name}</span>
        <span className={styles.toggleArrow}>{isExpanded ? '▲' : '▼'}</span>
      </button>
      {isExpanded && (
        <div className={styles.templateList}>
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              className={`${styles.templateButton} ${selectedTemplate.id === template.id ? styles.active : ''}`}
              onClick={() => {
                onSelect(template);
                setIsExpanded(false);
              }}
            >
              {template.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

