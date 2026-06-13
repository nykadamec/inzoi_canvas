// rpcClient.js
// WebSocket RPC klient — přímá adaptace z userscriptu

const WS_URL = 'wss://api.canvas.playinzoi.com';

class InzoiRPC {
  constructor() {
    this.ws = null;
    this.pending = new Map();
    this.id = 0;
    this.connected = false;
    this._debug = true;
  }

  _log(...args) {
    if (this._debug) console.log('[InzoiCanvas:rpc]', ...args);
  }

  /**
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this._log('Connecting to WebSocket...');
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.connected = true;
        this._log('Connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          this._log('Parse error:', e);
        }
      };

      this.ws.onerror = (e) => {
        this.connected = false;
        reject(e);
      };

      this.ws.onclose = () => {
        this.connected = false;
      };

      setTimeout(() => {
        if (!this.connected) reject(new Error('Connection timeout'));
      }, 10000);
    });
  }

  _handleMessage(msg) {
    if (!msg.id || !this.pending.has(msg.id)) return;
    const { resolve, reject } = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || 'RPC Error'));
    else resolve(msg.result || msg);
  }

  /**
   * @param {string} method
   * @param {object} params
   * @returns {Promise<object>}
   */
  async send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.connected || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }

      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this._log('Sending:', method);
      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method,
        params: [params],
        id,
      }));

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout for ${method}`));
        }
      }, 15000);
    });
  }

  /**
   * WebSocket login
   * @param {{ accountId: string, token: string }} auth
   */
  async login(auth) {
    await this.send('Account.LoginReq', {
      AccountId: auth.accountId,
      Token: auth.token,
      AuthedType: 'None',
    });
    this._log('Login successful');
  }

  /**
   * Získat seznam download URL pro canvas item
   * @param {string} canvasItemId
   * @returns {Promise<{ DownloadUrls: string[], DownloadThumbnailUrls: string[] }>}
   */
  async getDownloadUrls(canvasItemId) {
    return this.send('Canvas.DownloadCanvasItemReq', { canvasItemId });
  }

  close() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.connected = false;
  }
}
