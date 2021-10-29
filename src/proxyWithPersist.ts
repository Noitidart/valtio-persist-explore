import { get, set, toPath } from 'lodash';
import { proxy, snapshot, subscribe } from 'valtio';
import { subscribeKey } from 'valtio/utils';

export type ProxyPersistStorageEngine = {
  // returns null if file not exists
  getItem: (name: string) => string | null | Promise<string | null>;

  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
  getAllKeys: () => string[] | Promise<string[]>;
};

// "multi" only works for object type.
export enum PersistStrategy {
  SingleFile = 'SingleFile',
  MultiFile = 'MultiFile'
}

type Write = () => ReturnType<ProxyPersistStorageEngine['setItem']>;
type BulkWrite = () => Promise<Array<ReturnType<Write>>>;
type OnBeforeBulkWrite = (bulkWrite: BulkWrite) => void;
type OnBeforeWrite = (write: Write, path: string) => void;

interface IProxyWithPersistInputs<S extends object> {
  name: string;
  version: number;
  getStorage: () => ProxyPersistStorageEngine;
  persistPaths: {
    [key: string]: PersistStrategy;
  };
  migrate: {
    [key: number]: () => null;
  };
  onBeforeWrite?: OnBeforeWrite;
  onBeforeBulkWrite?: OnBeforeBulkWrite;
  initialState: S;
}

type IPersistedState<State extends object> = {
  [Key in keyof State]: State[Key];
} & {
  _persist: {
    version: number;
  } & (
    | {
        status: 'loading';
        loading: true;
        loaded: false;
        error: null;
      }
    | {
        status: 'loaded';
        loading: false;
        loaded: true;
        error: null;
      }
    | {
        status: 'error';
        loading: false;
        loaded: false;
        error: Error;
      }
  );
};

export default function proxyWithPersist<S extends object>(
  inputs: IProxyWithPersistInputs<S>
) {
  const onBeforeWrite: OnBeforeWrite =
    inputs.onBeforeWrite || (write => write());

  const proxyObject = proxy<IPersistedState<S>>({
    ...inputs.initialState,
    _persist: {
      version: inputs.version,
      status: 'loading',
      loading: true,
      loaded: false,
      error: null
    }
  });

  // key is path, value is un-stringified value. stringify happens at time of write
  const pendingWrites: Record<string, any> = {};

  const bulkWrite = () =>
    Promise.all(
      Object.entries(pendingWrites).map(([filePath, value]) => {
        // TODO: if removeItem/setItem fails, and pendingWrites doesn't include
        // filePath, then restore this. if it includes it on error, it means
        // another write/delete got queued up, and that takes precedence.
        delete pendingWrites[filePath];

        let write: Write;
        if (value === null) {
          // delete it
          write = () => {
            console.log('deleting filePath:', filePath);
            return inputs.getStorage().removeItem(filePath);
          };
        } else {
          write = () => {
            console.log('writing filePath:', filePath, 'value:', value);
            return inputs.getStorage().setItem(filePath, JSON.stringify(value));
          };
        }
        return onBeforeWrite(write, filePath);
      })
    );

  const onBeforeBulkWrite: OnBeforeBulkWrite =
    inputs.onBeforeBulkWrite || (bulkWrite => bulkWrite());

  (async function () {
    const allKeys = Object.values(inputs.persistPaths).includes(
      PersistStrategy.MultiFile
    )
      ? await inputs.getStorage().getAllKeys()
      : [];

    await Promise.all(
      Object.entries(inputs.persistPaths).map(async function loadPath([
        path,
        strategy
      ]) {
        const filePath = inputs.name + '-' + path;

        const pathParts = toPath(path);
        const pathStart = pathParts.slice(0, -1).join('');
        const pathKey = pathParts.slice(-1)[0];

        const proxySubObject =
          pathStart === '' ? proxyObject : get(proxyObject, pathStart);

        if (strategy === PersistStrategy.SingleFile) {
          const persistedString = await inputs.getStorage().getItem(filePath);
          console.log('persistedString:', persistedString);

          if (persistedString === null) {
            // file does not exist
          } else {
            const persistedValue = JSON.parse(persistedString);
            set(proxyObject, path, persistedValue);
          }

          const persistPath = (value: any) => {
            pendingWrites[filePath] =
              typeof value === 'object' ? snapshot(value) : value;
            onBeforeBulkWrite(bulkWrite);
          };

          if (pathKey === undefined) {
            subscribe(proxyObject, persistPath);
          } else {
            subscribeKey(proxySubObject, pathKey, persistPath);
          }
        } else if (strategy === PersistStrategy.MultiFile) {
          await Promise.all(
            allKeys.map(async leafPath => {
              if (
                leafPath.startsWith(inputs.name + '-') &&
                toPath(leafPath).slice(0, -1).join('.') === filePath
              ) {
                const persistedString = await inputs
                  .getStorage()
                  .getItem(leafPath);
                if (persistedString === null) {
                  throw new Error(
                    `Could not find file for leafPath found of "${leafPath}", this should not be possible as this was returned by inputs.getStorage().getAllKeys`
                  );
                }
                console.log('persistedString:', persistedString);

                const persistedValue = JSON.parse(persistedString);
                set(
                  proxyObject,
                  leafPath.substring(inputs.name.length + '-'.length),
                  persistedValue
                );
              }
            })
          );

          let prevValue =
            pathKey === undefined
              ? snapshot(proxyObject)
              : snapshot(proxySubObject[pathKey]);

          const persistLeaf = (valueProxy: any) => {
            const value = snapshot(valueProxy);
            // figured out which subkeys were added, removed, changed
            const keys = new Set(Object.keys(value));
            const prevKeys = new Set(Object.keys(prevValue));

            const possiblyUpdatedKeys = new Set(Object.keys(value));

            const addedKeys: string[] = [];
            keys.forEach(key => {
              if (!prevKeys.has(key)) {
                addedKeys.push(key);
                possiblyUpdatedKeys.delete(key);
              }
            });

            const removedKeys: string[] = [];
            prevKeys.forEach(prevKey => {
              if (!keys.has(prevKey)) {
                removedKeys.push(prevKey);
                possiblyUpdatedKeys.delete(prevKey);
              }
            });

            const updatedKeys: string[] = [];
            possiblyUpdatedKeys.forEach(possiblyUpdatedKey => {
              const prevKeyValue = prevValue[possiblyUpdatedKey];
              const keyValue = value[possiblyUpdatedKey];
              if (prevKeyValue !== keyValue) {
                updatedKeys.push(possiblyUpdatedKey);
              }
            });

            prevValue =
              pathKey === undefined
                ? snapshot(proxyObject)
                : snapshot(proxySubObject[pathKey]);

            if (addedKeys.length || removedKeys.length || updatedKeys.length) {
              console.log(
                JSON.stringify({ addedKeys, removedKeys, updatedKeys }, null, 2)
              );

              removedKeys.forEach(key => {
                pendingWrites[filePath + '.' + key] = null;
              });

              [...addedKeys, ...updatedKeys].forEach(key => {
                pendingWrites[filePath + '.' + key] = value[key];
              });

              onBeforeBulkWrite(bulkWrite);
            }
          };
          if (pathKey === undefined) {
            subscribe(proxyObject, persistLeaf);
          } else {
            subscribeKey(proxySubObject, pathKey, persistLeaf);
          }
        } else {
          throw new Error(
            `Unknown persist strategy of "${strategy}" for path "${filePath}".`
          );
        }
      })
    );

    Object.assign(proxyObject._persist, {
      loaded: true,
      loading: false,
      status: 'loaded'
    });
  })();

  return proxyObject;
}
