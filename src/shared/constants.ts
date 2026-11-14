// Values shared by the Electron (Node) side and the React UI.

/** TCP port the store server listens on. Tills connect to http://<server-ip>:SERVER_PORT */
export const SERVER_PORT = 4580

/**
 * Local port of the QuickBooks bridge. The Web Connector only allows http:// to
 * localhost, so when QuickBooks is on a different PC, DiamondPOS on that PC
 * relays http://localhost:4581/qbwc to the store server.
 */
export const QB_BRIDGE_PORT = 4581

/**
 * Oldest till version the server will accept. Raise this only when you make a
 * change that older tills genuinely cannot work with (e.g. you finally remove
 * an old column). Keeping it low is what makes rollback safe.
 */
export const MIN_CLIENT_VERSION = '0.3.22'

/** >>> CHANGE THESE to match the "publish" section of electron-builder.yml <<< */
export const GITHUB_OWNER = 'gunchman01'
export const GITHUB_REPO = 'DiamondPOS'
