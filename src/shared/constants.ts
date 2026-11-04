// Values shared by the Electron (Node) side and the React UI.

/** TCP port the store server listens on. Tills connect to http://<server-ip>:SERVER_PORT */
export const SERVER_PORT = 4580

/**
 * Oldest till version the server will accept. Raise this only when you make a
 * change that older tills genuinely cannot work with (e.g. you finally remove
 * an old column). Keeping it low is what makes rollback safe.
 */
export const MIN_CLIENT_VERSION = '0.1.0'

/** >>> CHANGE THESE to match the "publish" section of electron-builder.yml <<< */
export const GITHUB_OWNER = 'YOUR_GITHUB_ORG'
export const GITHUB_REPO = 'store-pos'
