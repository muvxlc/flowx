const SENSITIVE_KEY_NAMES =
  '(?:x[_-]?(?:api[_-]?key|apikey)|api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|secret|password|credential|credentials|prompt|prompts|auth|authorization)';
const SENSITIVE_KEY_PATTERN = new RegExp(`^${SENSITIVE_KEY_NAMES}$`, 'i');
const QUERY_PARAM_REGEX = new RegExp(`(${SENSITIVE_KEY_NAMES})=([^&\\s"'` + '<>]+)', 'gi');
const QUOTED_COLON_REGEX = new RegExp(
  `(["']?)(${SENSITIVE_KEY_NAMES})\\1\\s*:\\s*(["'])((?:\\\\.|(?!\\3)[^\\\\])*)\\3`,
  'gi'
);
const UNQUOTED_COLON_REGEX = new RegExp(
  `(["']?)(${SENSITIVE_KEY_NAMES})\\1\\s*:\\s*(?!\\[REDACTED\\]|Bearer\\s+\\[REDACTED\\])([^\\s,;\\r\\n"'{}\\]]+)`,
  'gi'
);

function redactRegexPatterns(text: string): string {
  return text
    .replace(/Bearer\s+[^\s"'`<>]+/gi, 'Bearer [REDACTED]')
    .replace(QUERY_PARAM_REGEX, '$1=[REDACTED]')
    .replace(QUOTED_COLON_REGEX, '$1$2$1: $3[REDACTED]$3')
    .replace(UNQUOTED_COLON_REGEX, '$1$2$1: [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/gi, 'sk-[REDACTED]');
}

function redactObjectTree(
  val: unknown,
  inSensitiveContext = false,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (val === null || typeof val !== 'object') {
    return inSensitiveContext ? '[REDACTED]' : typeof val === 'string' ? redactRegexPatterns(val) : val;
  }
  if (seen.has(val)) return '[CIRCULAR]';
  seen.add(val);
  if (Array.isArray(val)) {
    return val.map((item) => redactObjectTree(item, inSensitiveContext, seen));
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(val as Record<string, unknown>)) {
    const isSensitive = inSensitiveContext || SENSITIVE_KEY_PATTERN.test(key);
    result[key] = isSensitive
      ? item !== null && typeof item === 'object'
        ? redactObjectTree(item, true, seen)
        : '[REDACTED]'
      : redactObjectTree(item, false, seen);
  }
  return result;
}

function redactJsonBlocks(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '{' || char === '[') {
      const closeChar = char === '{' ? '}' : ']';
      let depth = 0, inStr = false, esc = false, j = i;
      while (j < text.length) {
        const cur = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (cur === '\\') esc = true;
          else if (cur === '"') inStr = false;
        } else if (cur === '"') {
          inStr = true;
        } else if (cur === char) {
          depth++;
        } else if (cur === closeChar && --depth === 0) {
          break;
        }
        j++;
      }
      if (depth === 0 && j < text.length) {
        try {
          const parsed = JSON.parse(text.slice(i, j + 1));
          if (typeof parsed === 'object' && parsed !== null) {
            result += JSON.stringify(redactObjectTree(parsed));
            i = j + 1;
            continue;
          }
        } catch {}
      }
    }
    result += char;
    i++;
  }
  return result;
}

export function redactLogMessage(message: string): string {
  return redactRegexPatterns(redactJsonBlocks(message));
}

function sanitizeLogArg(arg: unknown): unknown {
  if (typeof arg === 'string') return redactLogMessage(arg);
  if (typeof arg === 'number' || typeof arg === 'boolean' || arg == null) return arg;
  if (arg instanceof Error) return redactLogMessage(arg.stack || `${arg.name}: ${arg.message}`);
  if (typeof arg === 'object') {
    try {
      return redactLogMessage(JSON.stringify(redactObjectTree(arg)));
    } catch {
      return '[UNSERIALIZABLE_OBJECT]';
    }
  }
  return '[REDACTED]';
}

function emitLog(
  level: 'INFO' | 'WARN' | 'ERROR',
  fn: (...data: unknown[]) => void,
  msg: string,
  details: unknown[]
): void {
  const sanitizedMsg = `[${level}] ${redactLogMessage(msg)}`;
  if (details.length === 0) {
    fn(sanitizedMsg);
  } else {
    fn(sanitizedMsg, ...details.map(sanitizeLogArg));
  }
}

export function logInfo(message: string, ...details: unknown[]): void {
  emitLog('INFO', console.log, message, details);
}

export function logWarn(message: string, ...details: unknown[]): void {
  emitLog('WARN', console.warn, message, details);
}

export function logError(message: string, ...details: unknown[]): void {
  emitLog('ERROR', console.error, message, details);
}
