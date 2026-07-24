const DEFAULT_APP_ORIGIN = 'http://localhost:5173';

export function configuredCorsOrigins() {
  const configured = process.env.CORS_ORIGINS || process.env.APP_URL || DEFAULT_APP_ORIGIN;
  const origins = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return [...new Set(origins.length ? origins : [DEFAULT_APP_ORIGIN])];
}
