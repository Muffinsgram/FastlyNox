export function jumpToMessage(messageId) {
  if (!messageId) return;
  const target = document.getElementById(`message-${messageId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('message-jump-highlight');
  void target.offsetWidth;
  target.classList.add('message-jump-highlight');
  window.setTimeout(() => target.classList.remove('message-jump-highlight'), 1500);
}
