/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the compliance API. Empty means "same origin", which is what
   *  the dev-server proxy and a co-hosted production build both use. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
