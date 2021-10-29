import { get, set, toPath } from 'lodash';
import { proxy, snapshot } from 'valtio';
import { subscribeKey } from 'valtio/utils';

export type ProxyPersistStorageEngine = {
  // returns null if file not exists
  getItem: (name: string) => string | null | Promise<string | null>;

  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
  getAllKeys: () => string[] | Promise<string[]>;
};

// "multi" only works for object type.
type PersistTechnique = 'single' | 'multi';
type Write = () => ReturnType<ProxyPersistStorageEngine['setItem']>;
type OnBeforeWrite = (write: Write, path: string) => void;

interface IProxyWithPersistInputs<S extends object> {
  name: string;
  version: number;
  getStorage: () => ProxyPersistStorageEngine;
  persistPaths: {
    [key: string]: PersistTechnique;
  };
  migrate: {
    [key: number]: () => null;
  };
  onBeforeWrite?: OnBeforeWrite;
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

let allKeysPromise: Promise<string[]>;
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

  (async function () {
    if (!allKeysPromise) {
      allKeysPromise = new Promise(async resolve => {
        const allKeys = inputs.getStorage().getAllKeys();
        resolve(allKeys);
      });
    }
    const allKeys = await allKeysPromise;
    console.log('allKeys:', allKeys);

    await Promise.all(
      Object.entries(inputs.persistPaths).map(async function loadPath([
        path,
        technique
      ]) {
        const filePath = inputs.name + '-' + path;

        const pathParts = toPath(path);
        const pathStart = pathParts.slice(0, -1).join('');
        const pathKey = pathParts.slice(-1)[0];

        const proxySubObject =
          pathStart === '' ? proxyObject : get(proxyObject, pathStart);

        if (technique === 'single') {
          const persistedString = await inputs.getStorage().getItem(filePath);
          console.log('persistedString:', persistedString);

          if (persistedString === null) {
            // file does not exist
          } else {
            const persistedValue = JSON.parse(persistedString);
            set(proxyObject, path, persistedValue);
          }

          subscribeKey(proxySubObject, pathKey, function persistPath(value) {
            const write: Write = () => {
              console.log(
                'path changed persist it, path:',
                path,
                'value:',
                value
              );
              inputs.getStorage().setItem(filePath, JSON.stringify(value));
            };
            onBeforeWrite(write, path);
          });
        } else if (technique === 'multi') {
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

          let prevValue = snapshot(proxySubObject[pathKey]);
          subscribeKey(
            proxySubObject,
            pathKey,
            function persistLeaf(value, ...args) {
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

              console.log('possiblyUpdatedKeys:', possiblyUpdatedKeys);
              const updatedKeys: string[] = [];
              possiblyUpdatedKeys.forEach(possiblyUpdatedKey => {
                const prevKeyValue = prevValue[possiblyUpdatedKey];
                const keyValue = snapshot(value[possiblyUpdatedKey]);
                if (prevKeyValue !== keyValue) {
                  updatedKeys.push(possiblyUpdatedKey);
                }
              });

              prevValue = snapshot(value);

              if (
                addedKeys.length ||
                removedKeys.length ||
                updatedKeys.length
              ) {
                const write: Write = async () => {
                  console.log(
                    JSON.stringify(
                      {
                        addedKeys,
                        removedKeys,
                        updatedKeys
                      },
                      null,
                      2
                    )
                  );

                  await Promise.all([
                    ...removedKeys.map(key => {
                      inputs.getStorage().removeItem(filePath + '.' + key);
                    }),

                    ...[...addedKeys, ...updatedKeys].map(key => {
                      inputs
                        .getStorage()
                        .setItem(
                          filePath + '.' + key,
                          JSON.stringify(value[key])
                        );
                    })
                  ]);
                };

                onBeforeWrite(write, path);
              }
            }
          );
        } else {
          throw new Error(
            `Unknown persist technique of "${technique}" for path "${filePath}".`
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
