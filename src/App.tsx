import './App.css';

import { debounce } from 'lodash';
import { useSnapshot } from 'valtio';

import proxyWithPersist, {
  ProxyPersistStorageEngine,
} from './proxyWithPersist';

const storage: ProxyPersistStorageEngine = {
  getItem: (name: string) => window.localStorage.getItem(name),
  setItem: (name: string, value: string) =>
    window.localStorage.setItem(name, value),
  removeItem: (name: string) => window.localStorage.removeItem(name)
};

const stateProxy = proxyWithPersist({
  name: 'app',
  getStorage: () => storage,
  onBeforeWrite: debounce(write => write(), 1000, { maxWait: 1000 }),
  version: 0,
  persistPaths: {
    count: 'single'
  },
  initialState: {
    count: 0
  },
  migrate: {}
});

function App() {
  const state = useSnapshot(stateProxy);

  return (
    <div className="App">
      <header className="App-header">
        <p>
          Loading: {String(state._persist.loading)}
          <br />
          Loaded: {String(state._persist.loaded)}
          <br />
          Counter: {state.count}
        </p>
        <a
          className="App-link"
          href="#"
          onClick={() => {
            stateProxy.count++;
          }}
        >
          Increment
        </a>{' '}
        <a
          className="App-link"
          href="#"
          onClick={() => {
            stateProxy.count--;
          }}
        >
          Decrement
        </a>
      </header>
    </div>
  );
}

export default App;
