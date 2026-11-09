/** Chat ids: plain tokens the Rust side accepts ([A-Za-z0-9_-], max 64). */
export function newChatId(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
