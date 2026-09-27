// Passwords the user typed for protected PDFs, kept only in memory and keyed by the File object.
const store = new WeakMap()

export const setPassword = (file, pw) => { if (file && typeof file === 'object') store.set(file, pw) }
export const getPassword = (file) => (file && typeof file === 'object' ? store.get(file) : undefined)
