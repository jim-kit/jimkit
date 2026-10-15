export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
