const isCustomEmojiUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

export function RoleEmoji({ value, className = 'h-4 w-4', alt = '' }) {
  if (!value) return null;
  if (isCustomEmojiUrl(value)) return <img src={value} alt={alt} aria-hidden={alt ? undefined : 'true'} draggable="false" className={`${className} shrink-0 rounded object-contain`} />;
  return <span aria-hidden={alt ? undefined : 'true'} className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}>{value}</span>;
}
