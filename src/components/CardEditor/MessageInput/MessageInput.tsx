// メッセージ入力コンポーネント

import styles from './MessageInput.module.css';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

export function MessageInput({
  value,
  onChange,
  maxLength = 200,
}: MessageInputProps) {
  return (
    <div className={styles.messageInput}>
      <label htmlFor="message" className={styles.label}>
        ひと言メッセージ
      </label>
      <textarea
        id="message"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder="新年あけましておめでとうございます！今年もよろしくお願いします。"
        className={styles.textarea}
        rows={4}
      />
      <div className={styles.charCount}>
        <span className={value.length >= maxLength ? styles.limit : ''}>
          {value.length}
        </span>
        / {maxLength}
      </div>
    </div>
  );
}

