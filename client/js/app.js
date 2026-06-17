import * as actions from './actions.js';

// Inline onclick="..." attributes in the rendered HTML call these by name,
// so every action needs to be reachable from the global scope.
Object.assign(window, actions);

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); actions.runQuery(); }
});

actions.boot();
