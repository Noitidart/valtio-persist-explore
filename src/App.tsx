import './App.css';

import { throttle, uniqueId } from 'lodash';
import { useSnapshot } from 'valtio';

import proxyWithPersist, {
  PersistStrategy,
  ProxyPersistStorageEngine,
} from './proxyWithPersist';

const storage: ProxyPersistStorageEngine = {
  getItem: (name: string) => window.localStorage.getItem(name),
  setItem: (name: string, value: string) =>
    window.localStorage.setItem(name, value),
  removeItem: (name: string) => window.localStorage.removeItem(name),
  getAllKeys: () => {
    return Object.keys(window.localStorage);
  }
};

type PhotoId = string;
const initialState: {
  count: number;
  photos: Record<PhotoId, { id: PhotoId; createdAt: number; clicks: number }>;
} = {
  count: 0,
  photos: {
    photoFixed: {
      id: 'photoFixed',
      createdAt: 0,
      clicks: 999
    }
  }
};

const onBeforeBulkWrite = throttle(bulkWrite => bulkWrite(), 1000, {
  leading: false
});

window.addEventListener('blur', () => {
  console.log('flushing due to blur');
  onBeforeBulkWrite.flush();
});

window.addEventListener('beforeunload', function (e) {
  console.log('flushing due to before unload');
  onBeforeBulkWrite.flush();
});

const stateProxy = proxyWithPersist({
  name: 'app',
  getStorage: () => storage,
  onBeforeBulkWrite,
  version: 21,
  // persistStrategies: PersistStrategy.SingleFile,
  persistStrategies: {
    count: PersistStrategy.SingleFile,
    photos: PersistStrategy.MultiFile
  },
  initialState,
  migrate: {
    16: () => {
      stateProxy.photos.addedInV16 = {
        id: 'addedInV16',
        createdAt: 100,
        clicks: 10
      };
    },
    20: () => {
      stateProxy.photos.addedInV16.clicks = 20;
    },
    21: () => {
      stateProxy.photos.addedInV16.clicks = 21;
    }
  }
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
          onClick={e => {
            e.preventDefault();
            stateProxy.count++;
          }}
        >
          Increment
        </a>{' '}
        <a
          className="App-link"
          href="#"
          onClick={e => {
            e.preventDefault();
            stateProxy.count--;
          }}
        >
          Decrement
        </a>
        <a
          className="App-link"
          href="#"
          onClick={e => {
            e.preventDefault();
            let photoId = uniqueId('photo');
            while (photoId in stateProxy.photos) {
              photoId = uniqueId('photo');
            }
            const photo = {
              id: photoId,
              createdAt: Date.now(),
              clicks: 0
            };

            stateProxy.photos[photoId] = photo;
          }}
        >
          Add Photo
        </a>
        {Object.entries(state.photos)
          .sort((a, b) => a[1].createdAt - b[1].createdAt)
          .map(([photoId, photo]) => (
            <div key={photoId}>
              <i>{photoId}</i>
              <button
                type="button"
                onClick={() => {
                  delete stateProxy.photos[photoId];
                }}
              >
                delete
              </button>
              <button
                type="button"
                onClick={() => {
                  stateProxy.photos[photoId].clicks++;
                }}
              >
                Clicks: {photo.clicks}
              </button>
              {new Date(photo.createdAt).toLocaleTimeString()}
            </div>
          ))}
      </header>
    </div>
  );
}

export default App;
