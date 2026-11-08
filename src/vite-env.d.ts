/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/** Injected by vite.config.ts at build time: { version, sha, builtAt }. */
declare const __APP_VERSION__: { version: string; sha: string; builtAt: string };
