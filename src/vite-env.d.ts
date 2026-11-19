/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** 0032: the YAC Gmail address shown on "Check your inbox" (optional). */
  readonly VITE_YAC_SENDER_EMAIL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/** Injected by vite.config.ts at build time: { version, sha, builtAt }. */
declare const __APP_VERSION__: { version: string; sha: string; builtAt: string };
