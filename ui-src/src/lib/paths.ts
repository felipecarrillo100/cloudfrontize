/** Path helpers for paths the server sends (POSIX or Windows). */
const sepOf = (p: string) => (/^[A-Za-z]:\\/.test(p) || p.includes('\\') ? '\\' : '/')

export function joinPath(dir: string, name: string): string {
  const sep = sepOf(dir)
  return dir.endsWith(sep) ? dir + name : dir + sep + name
}

export function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}

/** The folders from `root` down to `p`, for breadcrumbs. */
export function crumbs(p: string, root: string): { name: string; path: string }[] {
  const sep = sepOf(p)
  if (!p.startsWith(root)) return [{ name: p, path: p }]
  const rest = p.slice(root.length).split(/[\\/]/).filter(Boolean)
  const out = [{ name: baseName(root) || root, path: root }]
  let current = root
  for (const part of rest) {
    current = current.endsWith(sep) ? current + part : current + sep + part
    out.push({ name: part, path: current })
  }
  return out
}

/** A folder name from a project name: "My Shop!" → "my-shop". */
export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}
