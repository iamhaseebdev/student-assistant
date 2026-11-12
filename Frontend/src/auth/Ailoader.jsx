import React, { useEffect, useState } from 'react';
import styles from './AiLoader.module.css';

/**
 * Full-screen AI "neural orb" loader.
 * <AiLoader show={loading} messages={['Verifying your code…', 'Creating your account…']} />
 */
const AiLoader = ({ show, messages = ['Processing…'], interval = 1800 }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!show) {
      setIndex(0);
      return;
    }
    if (messages.length < 2) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, interval);
    return () => clearInterval(timer);
  }, [show, messages.length, interval]);

  if (!show) return null;

  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.orb} aria-hidden="true">
        <div className={styles.scan} />

        <div className={`${styles.ring} ${styles.ringOuter}`}>
          {[0, 120, 240].map((angle, i) => (
            <span
              key={angle}
              className={styles.nodeWrap}
              style={{ '--angle': `${angle}deg`, '--delay': `${i * 0.35}s` }}
            >
              <span className={styles.node} />
            </span>
          ))}
        </div>

        <div className={`${styles.ring} ${styles.ringInner}`}>
          {[60, 240].map((angle, i) => (
            <span
              key={angle}
              className={styles.nodeWrap}
              style={{ '--angle': `${angle}deg`, '--delay': `${i * 0.5}s` }}
            >
              <span className={`${styles.node} ${styles.nodeGreen}`} />
            </span>
          ))}
        </div>

        <div className={styles.core} />
      </div>

      <p className={styles.label} key={index}>
        {messages[index]}
        <span className={styles.dots}>
          <i />
          <i />
          <i />
        </span>
      </p>
    </div>
  );
};

export default AiLoader;