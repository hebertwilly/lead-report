const USERNAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normaliza a identidade legível usada por clientes: login, username e slug.
 * A validação no servidor continua sendo a fonte de verdade.
 */
export function normalizeUsername(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidUsername(username: string) {
  return username.length >= 3 && username.length <= 63 && USERNAME_PATTERN.test(username);
}
