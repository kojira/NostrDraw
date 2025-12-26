// 台紙選択コンポーネント（テンプレート + 干支ギャラリー統合）

import { useState } from 'react';
import { TEMPLATES } from '../../../data/templates';
import type { Template } from './types';
import type { EtoImage } from '../../../types';
import styles from './DrawingCanvas.module.css';

interface TemplateSelectorProps {
  selectedTemplate: Template;
  onSelect: (template: Template) => void;
  etoImages?: EtoImage[];
}

// SVGをdata URIに変換
function svgToDataUri(svg: string, width: number, height: number): string {
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${svg}</svg>`;
  const encoded = btoa(unescape(encodeURIComponent(fullSvg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

// 干支画像からテンプレートを生成
function etoImageToTemplate(etoImage: EtoImage): Template {
  // SVGからviewBox内のコンテンツを抽出
  const svgMatch = etoImage.svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const innerSvg = svgMatch ? svgMatch[1] : etoImage.svg;
  
  // 200x200のSVGを400x300のキャンバスいっぱいに配置
  // 高さを基準に1.5倍（200→300）にスケール、横は中央揃え
  return {
    id: `eto-${etoImage.id}`,
    name: etoImage.name,
    svg: `<rect width="400" height="300" fill="#FFF8F0"/>
<g transform="translate(50, 0) scale(1.5)">
  <svg viewBox="0 0 200 200" width="200" height="200">${innerSvg}</svg>
</g>`,
  };
}

export function TemplateSelector({ selectedTemplate, onSelect, etoImages = [] }: TemplateSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'eto'>('eto');

  // 干支画像をテンプレートに変換
  const etoTemplates = etoImages.map(etoImageToTemplate);

  return (
    <div className={styles.templateSection}>
      <button 
        className={styles.templateToggle}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>🎨 台紙: {selectedTemplate.name}</span>
        <span className={styles.toggleArrow}>{isExpanded ? '▲' : '▼'}</span>
      </button>
      
      {isExpanded && (
        <div className={styles.templateContent}>
          {/* タブ切り替え */}
          <div className={styles.templateTabs}>
            <button
              className={`${styles.templateTabButton} ${activeTab === 'eto' ? styles.active : ''}`}
              onClick={() => setActiveTab('eto')}
            >
              🐴 干支ギャラリー
            </button>
            <button
              className={`${styles.templateTabButton} ${activeTab === 'basic' ? styles.active : ''}`}
              onClick={() => setActiveTab('basic')}
            >
              📝 ベース台紙
            </button>
          </div>

          {/* 干支ギャラリー */}
          {activeTab === 'eto' && (
            <div className={styles.etoGallery}>
              {etoTemplates.map((template) => {
                const etoImage = etoImages.find(e => `eto-${e.id}` === template.id);
                const isSelected = selectedTemplate.id === template.id;
                // 元のSVGをそのまま表示用に使用
                const previewDataUri = etoImage 
                  ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(etoImage.svg)))}`
                  : svgToDataUri(template.svg, 400, 300);
                
                return (
                  <button
                    key={template.id}
                    className={`${styles.etoButton} ${isSelected ? styles.active : ''}`}
                    onClick={() => {
                      onSelect(template);
                      setIsExpanded(false);
                    }}
                    title={template.name}
                  >
                    <img 
                      src={previewDataUri} 
                      alt={template.name}
                      className={styles.etoPreview}
                    />
                    <span className={styles.etoName}>{template.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ベース台紙 */}
          {activeTab === 'basic' && (
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
      )}
    </div>
  );
}
