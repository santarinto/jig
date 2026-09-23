import '@testing-library/jest-dom/vitest'

// Node 22+ ships an experimental `localStorage` global that resolves to undefined
// unless the process was started with --localstorage-file, and it shadows the jsdom
// implementation. On Node 26 that leaves both `localStorage` and `window.localStorage`
// undefined, so the theme suite dies on `localStorage.clear()` and the persistence
// paths it is meant to cover never execute at all.
//
// An in-memory store keeps those tests real and identical across node versions.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() { return store.size },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => { store.set(String(k), String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage, writable: true, configurable: true,
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage, writable: true, configurable: true,
    })
  }
}

// jsdom не реализует `scrollIntoView` — у прототипа его просто НЕТ (проверено:
// `typeof Element.prototype.scrollIntoView === 'undefined'`). Кадр зовёт его,
// чтобы показать новое место канваса ([9] ручного QA, DS-128), и без
// заглушки любой кейс, меняющий выделение, падал бы на «not a function» —
// то есть среда прятала бы предмет.
//
// Заглушка ЗДЕСЬ, а не `?.()` в коде: необязательный вызов в рантайме означал
// бы «браузер может не уметь прокручивать», чего не бывает, и прятал бы
// настоящую опечатку в имени метода.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}
