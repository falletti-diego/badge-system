import '@testing-library/jest-dom';

// happy-dom 20.x has a broken Storage prototype where methods like
// clear(), removeItem(), setItem(), getItem() are not callable.
// Replace with a compliant in-memory implementation.
const createStorage = () => {
  let store = {};
  const storage = {
    getItem: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
  return storage;
};

Object.defineProperty(globalThis, 'localStorage', {
  value: createStorage(),
  writable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: createStorage(),
  writable: true,
});
