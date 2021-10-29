import { get, set, toPath } from 'lodash';
import { proxy } from 'valtio';
import { subscribeKey } from 'valtio/utils';

export type ProxyPersistStorageEngine = {
  // returns null if file not exists
  getItem: (name: string) => string | null | Promise<string | null>;

  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
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

  Promise.all(
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
      } else {
        throw new Error(
          `Unknown persist technique of "${technique}" for path "${filePath}".`
        );
      }
    })
  ).then(() => {
    Object.assign(proxyObject._persist, {
      loaded: true,
      loading: false,
      status: 'loaded'
    });
  });

  return proxyObject;
}
