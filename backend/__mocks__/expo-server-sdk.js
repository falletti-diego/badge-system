/**
 * Automatic Jest mock for `expo-server-sdk` (node_modules package).
 *
 * The real package ships an ESM build (`build/ExpoClient.js` uses
 * `import assert from 'node:assert'`) that Jest cannot parse without a
 * babel transform, and this project has none configured. Before Task 7
 * wired `notifyEmployee()` into `shifts.js`, nothing under `src/routes/`
 * required `utils/pushNotifications.js`, so `require('expo-server-sdk')`
 * was never reached by the ~70 test files that do `require('../app')` —
 * once shifts.js pulled it in transitively, every one of those suites
 * failed with "Cannot use import statement outside a module".
 *
 * Placing a manual mock here (Jest's documented convention for
 * node_modules packages: a file at <rootDir>/__mocks__/<pkg>.js is used
 * automatically for every test, no per-file jest.mock() call needed)
 * fixes that without touching the ~70 unrelated test files. A test file
 * that needs to assert on push-send behavior (e.g. pushNotifications.test.js)
 * can still call `jest.mock('expo-server-sdk', factory)` itself — an
 * explicit jest.mock() in a test file always overrides this automatic
 * mock for that file.
 */

class Expo {
  chunkPushNotifications(messages) {
    return [messages];
  }

  async sendPushNotificationsAsync() {
    return [];
  }
}

Expo.isExpoPushToken = () => true;

module.exports = { Expo };
