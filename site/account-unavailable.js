// Live authentication is connected in the next integration stage.
export function createAccountProvider() {
  const snapshot = () => ({status: 'unavailable', user: null, allowance: null});
  return {
    getState: snapshot,
    subscribe(listener) { listener(snapshot()); return () => {}; },
    async signIn() { return snapshot(); },
    async signOut() { return snapshot(); },
    async readDocument() { return snapshot(); },
    async completeCallback() { return false; }
  };
}
