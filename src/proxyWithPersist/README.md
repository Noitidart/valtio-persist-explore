`npm i valtio-persist` allows flexible and performant saving of state to disk.

## Usage

### Basic (Quick Start)

```typescript
import proxyWithPersist from 'valtio-persist';
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
