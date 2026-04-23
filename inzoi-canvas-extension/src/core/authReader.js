// authReader.js
// Čte session data z page localStorage (stejná logika jako userscript)

const InzoiAuth = {
  /**
   * @returns {{ accountId: string|null, token: string|null, refreshToken: string|null }}
   */
  read() {
    try {
      const raw = localStorage.getItem('auth');
      if (!raw) return { accountId: null, token: null, refreshToken: null };
      const parsed = JSON.parse(raw);
      const state = parsed?.state || parsed;
      return {
        accountId: state.authData?.AccountId || state.accountId,
        token:     state.authData?.AccessToken || state.accessToken,
        refreshToken: state.authData?.RefreshToken || state.refreshToken,
      };
    } catch (e) {
      console.warn('[InzoiCanvas] authReader: parse error', e);
      return { accountId: null, token: null, refreshToken: null };
    }
  },

  isLoggedIn() {
    return !!this.read().token;
  },
};
