import { useEffect } from 'react';

export function useEscapeClose(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof onClose !== 'function') return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, enabled]);
}
