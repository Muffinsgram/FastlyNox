const COMMAND_HELP = 'Komutlar: /me <metin> · /shrug <metin> · /tableflip <metin> · /help';

export function resolveChatCommand(content) {
  const value = String(content || '').trim();
  const match = value.match(/^\/(\S+)(?:\s+([\s\S]*))?$/u);
  if (!match) return { handled: false, content: value };

  const name = match[1].toLocaleLowerCase('tr-TR');
  const text = (match[2] || '').trim();
  if (['help', 'yardım', 'yardim'].includes(name)) return { handled: true, type: 'help' };
  if (name === 'me') return text ? { handled: true, content: `*${text}*` } : { handled: true, type: 'error', message: 'Kullanım: /me <metin>' };
  if (name === 'shrug') return { handled: true, content: `${text ? `${text} ` : ''}¯\\_(ツ)_/¯` };
  if (['tableflip', 'flip'].includes(name)) return { handled: true, content: `${text ? `${text} ` : ''}(╯°□°)╯︵ ┻━┻` };
  return { handled: false, unknown: true, content: value };
}

export { COMMAND_HELP };
