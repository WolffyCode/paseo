// psl ships types but its package.json `exports` doesn't point at them, so bundler resolution
// can't find them. Only what the app uses is declared.
declare module "psl" {
  /** The registrable domain (eTLD+1) of a host, or null when it has none. */
  export function get(domain: string): string | null;
}
