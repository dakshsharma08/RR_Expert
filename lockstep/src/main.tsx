import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import { App } from './app/App';

// App screens read the local database straight away. Start downloading that code in
// parallel with the route chunks, instead of after them (shorter waterfall on phones).
if (!['/', '/cover'].includes(window.location.pathname)) {
  void import('./db/repo');
  void import('./db/hooks');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
