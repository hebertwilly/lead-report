const DEVELOPMENT_APP_URL = "http://localhost:3000";

/** URL pública centralizada e sempre reduzida à raiz da aplicação. */
export function getAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredUrl) return DEVELOPMENT_APP_URL;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.origin;
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL deve ser uma URL HTTP ou HTTPS válida.");
  }
}
