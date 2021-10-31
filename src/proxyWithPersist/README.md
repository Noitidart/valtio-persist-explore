`npm i valtio-persist` allows flexible and performant saving of state to disk.

## Usage

### Basic (Quick Start)

```typescript
import proxyWithPersist, { PersistStrategy } from 'valtio-persist';
import { subscribeKey } from 'valtio/utils';

const appStateProxy = proxyWithPersist({
  initialState: {
    counter: 0
  },
  version: 0,
  name: 'appState',
  persistStrategies: PersistStrategy.SingleFile,
  migrate: {},

  // see "Storage Engine" section below
  getStorage: () => storage
});

console.log('counter:', appStateProxy.counter);

subscribeKey(appStateProxy._persist, 'loaded', loaded => {
  if (loaded) {
    console.log(
      'it is now safe to make changes to appStateProxy. the changes will now be persisted.'
    );
  }
});
```

This will persist the entire object into one file, on every change.

You can read from `appStateProxy` immediately, however if you want changes persisted, wait until `appStateProxy._persist.loaded` goes to `true`.

This is obvious but to be safe, keep in mind the base value (`initialState`) must be an object. This applies to `proxy` as well from valtio, the argument to `proxy` is an object.

## Storage Engine

You can use any storage engine as long as it respects the following interface:

```typescript
export type ProxyPersistStorageEngine = {
  // returns null if file not exists
  getItem: (name: string) => string | null | Promise<string | null>;

  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
  getAllKeys: () => string[] | Promise<string[]>;
};
```

`getItem` should return `null` if file or path does not exist.

`getAllKeys` is used for the `PersistStrategy.MultiFile`. If you do not use this strategy, then you can make this function no-op.

### [`window.localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

```typescript
import proxyWithPersist from 'valtio-persist';
import type { ProxyPersistStorageEngine } from 'valtio-persist';

const storage: ProxyPersistStorageEngine = {
  getItem: name => window.localStorage.getItem(name),
  setItem: (name, value) => window.localStorage.setItem(name, value),
  removeItem: name => window.localStorage.removeItem(name),
  getAllKeys: () => Object.keys(window.localStorage);
};

const stateProxy = proxyWithPersist({
  getStorage: () => storage;
});
```

### [`@react-native-async-storage/async-storage`](https://github.com/react-native-async-storage/async-storage)

```
npm i @react-native-async-storage/async-storage
```

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import proxyWithPersist from 'valtio-persist';
import type { ProxyPersistStorageEngine } from 'valtio-persist';

const storage: ProxyPersistStorageEngine = {
  getItem: name => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: name => AsyncStorage.removeItem(name),
  getAllKeys: () => AsyncStorage.getAllKeys();
};

const stateProxy = proxyWithPersist({
  getStorage: () => storage;
});
```

### [`expo-file-system`](https://docs.expo.dev/versions/latest/sdk/filesystem/#filesystemdocumentdirectory)

```
expo install expo-file-system
```

```typescript
import * as FileSystem from 'expo-file-system';
import proxyWithPersist from 'valtio-persist';
import type { ProxyPersistStorageEngine } from 'valtio-persist';

const storage: ProxyPersistStorageEngine = {
  getItem: name => FileSystem.readAsStringAsync(FileSystem.documentDirectory + name),
  setItem: (name, value) => FileSystem.writeAsStringAsync(FileSystem.documentDirectory + name, value),
  removeItem: name => FileSystem.deleteAsync(FileSystem.documentDirectory + name),
  getAllKeys: () => FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
};

const stateProxy = proxyWithPersist({
  getStorage: () => storage;
});
```

## Persist Strategies

There are two

## Whitelisting

To only persist certain keys, define an object for the `persistStrategies` option. The keys of this object are dot path notation for the paths you want to store.

### Example:

```typescript
const stateProxy = proxyWithPersist({
  // ...

  initialState: {
    entities: {
      tasks: {},
      schedules: {}
    }
  },

  persistStrategies: {
    'entities.tasks': PersistStrategy.SingleFile
  }
});
```

In this example, only `stateProxy.entities.tasks` will get persisted. Any changes to `stateProxy.entities.schedules` or anywhere else, will not get persisted.

## Recipes

### Throttle Writes for Performance

Sometimes, writing to disk on every change immediately hurts performance. Here is a technique to changes get persisted at most once a second. It uses the [`throttle`](https://lodash.com/docs/4.17.15#throttle) method from lodash. It will save to disk at most once a second.

Note: Debounce is not recommended as it could lead to starvation. For example, if writes are debounced to 1 second, but writes happen after 0.5s, then a write will never happen.

```
npm i lodash
```

```typescript
import { throttle } from 'lodash';

const stateProxy = proxyWithPersist({
  // ...

  onBeforeBulkWrite: throttle(bulkWrite => bulkWrite(), 1000)
}
```
