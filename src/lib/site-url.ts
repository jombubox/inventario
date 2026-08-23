export function getSiteUrl(environment?: NodeJS.ProcessEnv): URL | null {
  const configured = (
    environment ? environment.NEXT_PUBLIC_SITE_URL : process.env.NEXT_PUBLIC_SITE_URL
  )?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return new URL(url.origin);
      }
    } catch {
      // The environment validator reports configuration errors where credentials are loaded.
    }
  }

  const nodeEnv = environment ? environment.NODE_ENV : process.env.NODE_ENV;
  return nodeEnv === "development" ? new URL("http://localhost:3000") : null;
}

export function absoluteSiteUrl(pathname: string, environment?: NodeJS.ProcessEnv): string | null {
  const base = getSiteUrl(environment);
  return base ? new URL(pathname, base).toString() : null;
}
