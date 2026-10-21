/**
 * Turns model output into text that a TTS engine can read naturally.
 *
 * Quotes, markdown, arrows and emoji are the usual culprits behind robotic
 * "quote ... quote" playback, so they are removed or spelled out here.
 */
export function toSpeechText(input: string, lang: 'en' | 'zh' = 'en'): string {
  let text = String(input || '');

  // fenced/inline code and images/links
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/https?:\/\/\S+/g, ' ');

  // markdown emphasis / headings / bullets / table pipes
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, '');
  text = text.replace(/^\s{0,3}>\s?/gm, '');
  text = text.replace(/[*_~#|]+/g, ' ');
  text = text.replace(/<[^>]+>/g, ' ');

  // quotes of every flavour (keep the apostrophe: it's needed for contractions)
  text = text.replace(/["\u201C\u201D\u00AB\u00BB\u201E\u201A]/g, '');
  text = text.replace(/[\u2018\u2019]/g, "'");

  // symbols that TTS reads literally
  text = text.replace(/\s*(?:→|⇒|->)\s*/g, ' to ');
  text = text.replace(/\s*&\s*/g, ' and ');
  text = text.replace(/\s*%\s*/g, ' percent ');
  text = text.replace(/\s*\+\s*/g, ' plus ');
  text = text.replace(/\s*=\s*/g, ' equals ');
  text = text.replace(/\s*…\s*/g, '. ');
  text = text.replace(/\.{3,}/g, '. ');

  // common abbreviations that sound better spelled out
  text = text.replace(/\be\.g\.\s*/gi, 'for example, ');
  text = text.replace(/\bi\.e\.\s*/gi, 'that is, ');
  text = text.replace(/\bvs\.?\s*/gi, 'versus ');

  // emoji
  text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ');

  // brackets/parentheses create odd pauses; keep the words
  text = text.replace(/[()\[\]{}]/g, ', ');

  // tidy punctuation and spacing
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\s*\n+\s*/g, '. ');
  text = text.replace(/([.!?])\s*,\s*/g, '$1 ');
  text = text.replace(/,\s*([.!?;:])/g, '$1');
  text = text.replace(/\s+([,.!?;:])/g, '$1');
  text = text.replace(/([,.!?;:])(?=[A-Za-z0-9])/g, '$1 ');
  text = text.replace(/,(\s*,)+/g, ',');
  text = text.replace(/\.(\s*\.)+/g, '.');
  text = text.replace(/([.!?]\s+)([a-z])/g, (_m, p, c: string) => p + c.toUpperCase());
  text = text.replace(/^[\s.,;:]+/, '');

  return text.trim();
}
