// Finance OS Sync — State sanitization and logic for testing.
(() => {
  function isSyncing(inFlight, queueLen) {
    const inflightN = inFlight?.length ?? 0;
    const pending = queueLen ?? 0;
    return inflightN > 0 || pending > 0;
  }

  function sanitizeError(summaries) {
    if (!Array.isArray(summaries) || summaries.length === 0) {
      return '未知同步错误，请重试';
    }
    const raw = String(summaries[0] || '').trim();
    if (!raw) return '未知同步错误，请重试';

    // 1. Hide tokens, JWTs, and long hex strings
    let sanitized = raw.replace(/(?:ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, '[TOKEN]');
    sanitized = sanitized.replace(/[a-f0-9]{32,}/gi, '[HASH]');
    
    // 2. Hide authorization headers if present
    sanitized = sanitized.replace(/(authorization|bearer)\s+[^\s]+/gi, '$1 [REDACTED]');

    // 3. Hide internal URLs or paths
    sanitized = sanitized.replace(/https?:\/\/[^\s]+/gi, '[URL]');
    sanitized = sanitized.replace(/(?:\/[a-zA-Z0-9_-]+){3,}/g, '[PATH]');

    // 4. Hide stack traces (truncate everything after 'at ')
    const stackIdx = sanitized.indexOf('    at ');
    if (stackIdx !== -1) {
      sanitized = sanitized.substring(0, stackIdx).trim();
    }

    // 5. Limit length to prevent UI overflow
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 97) + '...';
    }

    return sanitized;
  }

  const api = {
    isSyncing,
    sanitizeError
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    if (typeof self !== "undefined") self.FOS_SYNC_LOGIC = api;
    if (typeof window !== "undefined") window.FOS_SYNC_LOGIC = api;
  }
})();
