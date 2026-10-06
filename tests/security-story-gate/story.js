// No mdhere imports: this is an adversarial, standalone local story fixture.
const results = document.querySelector('#results');
const record = (label, value) => {
  results.textContent += `${new Date().toISOString()} ${label}: ${value}\n`;
};
const sink = 'http://127.0.0.1:8765';
record('mdhere-story-gate', '__GATE_RUN_ID__');
record('script', 'local classic JS ran');
record('css-animation', getComputedStyle(document.querySelector('#motion')).animationName);
for (const id of ['local-image', 'escaped-image']) {
  const image = document.querySelector(`#${id}`);
  image.addEventListener('load', () => record(id, 'loaded'));
  image.addEventListener('error', () => record(id, 'blocked/error'));
  if (image.complete) record(id, image.naturalWidth ? 'loaded' : 'blocked/error');
}
record('location-origin (URL, not security origin)', location.origin);
record('effective-window-origin', self.origin);
try {
  localStorage.setItem('mdhere-gate', 'unexpected');
  record('opaque-origin-storage', 'UNEXPECTED allowed');
} catch (error) {
  record('opaque-origin-storage', error.name);
}
try {
  record('parent-dom', parent.document.body.tagName);
} catch (error) {
  record('parent-dom', error.name);
}
try {
  record('parent-tauri-internals-visible', Boolean(parent.__TAURI_INTERNALS__));
} catch (error) {
  record('parent-tauri-internals-visible', error.name);
}
record('frame-invoke-key-global-visible', typeof window.__TAURI_INVOKE_KEY__);

document.querySelector('#requests').onclick = () => {
  const highLevel = window.__TAURI_INTERNALS__?.invoke;
  record('high-level-invoke-visible', typeof highLevel);
  if (typeof highLevel === 'function') {
    try {
      Promise.resolve(highLevel('read_document', { path: 'known.md' }))
        .then((value) => record('HIGH-LEVEL READ DOCUMENT RESULT', JSON.stringify(value)))
        .catch((error) => record('high-level read denied', String(error)));
    } catch (error) {
      record('high-level read denied', String(error));
    }
  }
  const ipc = window.webkit?.messageHandlers?.ipc;
  record('low-level-ipc-visible', typeof ipc?.postMessage);
  if (typeof ipc?.postMessage === 'function') {
    // WK script handler accepts a JSON string with Tauri callback IDs. Supply a
    // deliberately invalid invoke key; any successful callback is a gate failure.
    const original = window.__TAURI_INTERNALS__;
    if (!original) {
      window.__TAURI_INTERNALS__ = {
        runCallback(id, payload) {
          record(`LOW-LEVEL IPC CALLBACK ${id}`, JSON.stringify(payload));
        }
      };
    }
    try {
      ipc.postMessage(
        JSON.stringify({
          cmd: 'read_document',
          callback: 8142,
          error: 8143,
          payload: { path: 'known.md' },
          __TAURI_INVOKE_KEY__: 'invalid-story-key'
        })
      );
      record('low-level-ipc-post', 'submitted; inspect callback and known.md result');
    } catch (error) {
      record('low-level-ipc-post', String(error));
    }
  }
  void (async () => {
    for (const [label, url] of [
      ['remote-fetch', `${sink}/fetch`],
      ['file-fetch', 'file:///etc/hosts'],
      ['asset-fetch', 'asset://localhost/etc/hosts'],
      ['app-fetch', 'tauri://localhost/index.html'],
      ['encoded-traversal', 'mdhere-story://localhost/1/%2e%2e/known.md']
    ]) {
      try {
        const response = await fetch(url);
        record(label, `UNEXPECTED response ${response.status}`);
      } catch (error) {
        record(label, String(error));
      }
    }
  })();
  for (const [label, url, tag] of [
    ['remote-image', `${sink}/image`, 'img'],
    ['remote-script', `${sink}/script`, 'script'],
    ['file-image', 'file:///etc/hosts', 'img'],
    ['asset-image', 'asset://localhost/etc/hosts', 'img'],
    ['app-image', 'tauri://localhost/index.html', 'img'],
    ['escaped-script', 'escape.js', 'script']
  ]) {
    const element = document.createElement(tag);
    element.onload = () => record(label, 'UNEXPECTED load');
    element.onerror = () => record(label, 'blocked/error');
    element.src = url;
    document.body.append(element);
    record(label, 'attempted');
  }
};

document.querySelector('#form').onsubmit = () => record('form', 'attempted');
document.querySelector('#navigation').onclick = () => {
  try {
    record('popup', String(window.open(`${sink}/popup`)));
  } catch (error) {
    record('popup', String(error));
  }
  try {
    top.location.href = `${sink}/top`;
    record('top-navigation', 'attempted');
  } catch (error) {
    record('top-navigation', String(error));
  }
};

document.querySelector('#self-navigation').onclick = () => {
  const url = document.querySelector('#self-target').value;
  record('self-navigation', `attempted ${url}`);
  location.href = url;
};

// One user gesture initiates every denied case. If a navigation unexpectedly
// succeeds the frame goes away; the developer must report that as a failure.
document.querySelector('#all-checks').onclick = () => {
  document.querySelector('#requests').click();
  document.querySelector('#form').requestSubmit();
  document.querySelector('#navigation').click();
  const targets = [...document.querySelector('#self-target').options].map((option) => option.value);
  const originalUrl = location.href;
  targets.forEach((url, index) =>
    setTimeout(
      () => {
        record('self-navigation', `attempted ${url}`);
        try {
          location.href = url;
        } catch (error) {
          record('self-navigation', `${url}: ${String(error)}`);
        }
        setTimeout(() => {
          record(
            'self-navigation-outcome',
            `${url}: ${location.href === originalUrl ? 'same URL, frame alive' : 'CHANGED URL ' + location.href}`
          );
        }, 150);
      },
      350 * (index + 1)
    )
  );
  setTimeout(
    () => record('automatic-attempts', 'finished; inspect sink and command results'),
    350 * (targets.length + 1)
  );
};

document.querySelector('#copy-results').onclick = () => {
  const range = document.createRange();
  range.selectNodeContents(results);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const copied = document.execCommand('copy');
  selection.removeAllRanges();
  document.querySelector('#copy-status').textContent = copied
    ? 'Observations copied. Press Enter in the terminal after checking the prototype.'
    : 'Copy blocked: select the results text and copy it manually, or report UNKNOWN.';
};
