// Installed by the app at document start, not imported by author files.
const hasControl = (value) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
if (window !== window.top && location.protocol === 'mdhere-story:') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      document.documentElement.dataset.mdhereStory = 'isolated';
    },
    { once: true }
  );

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.type === 'mdhere:story-palette') {
      const { palette, css } = event.data;
      if (!palette || typeof palette !== 'object' || typeof css !== 'string') return;
      for (const [name, value] of Object.entries(palette)) {
        if (typeof value !== 'string') return;
        if (name === 'color-scheme') {
          if (value !== 'light' && value !== 'dark') return;
        } else if (!/^--story-[a-z-]+$/.test(name)) return;
      }
      const root = document.documentElement;
      if (!root) return;
      for (const [name, value] of Object.entries(palette)) root.style.setProperty(name, value);
      let style = document.getElementById('mdhere-story-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'mdhere-story-style';
        (document.head || root).append(style);
      }
      style.textContent = css;
      return;
    }
    if (event.data?.type !== 'mdhere:story-position') return;
    const { fragment, scroll } = event.data;
    if (fragment !== null && (typeof fragment !== 'string' || hasControl(fragment))) return;
    if (typeof scroll !== 'number' || !Number.isFinite(scroll) || scroll < 0) return;
    if (fragment) location.hash = encodeURIComponent(fragment);
    else window.scrollTo(0, scroll);
  });

  const reportPosition = () => {
    let fragment;
    try {
      fragment = location.hash ? decodeURIComponent(location.hash.slice(1)) : null;
    } catch {
      return;
    }
    window.parent.postMessage(
      { type: 'mdhere:story-position', fragment, scroll: window.scrollY },
      '*'
    );
  };
  window.addEventListener('scroll', reportPosition, { passive: true });
  window.addEventListener('hashchange', reportPosition);

  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self'))
      return;
    const href = anchor.getAttribute('href');
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('/') ||
      href.includes('?') ||
      href.includes('\\') ||
      /^[a-z][a-z\d+.-]*:/i.test(href)
    )
      return;
    try {
      const destination = new URL(href, location.href);
      if (
        destination.origin !== location.origin ||
        destination.search ||
        !destination.pathname.startsWith('/' + location.pathname.split('/')[1] + '/')
      )
        return;
      const rawPath = href.split('#')[0];
      if (/%(?:2f|5c|00|25)/i.test(rawPath)) return;
      const path = destination.pathname.split('/').slice(2).map(decodeURIComponent).join('/');
      if (!path || /[\\%]/.test(path) || hasControl(path)) return;
      const kind = /\.html$/i.test(path)
        ? 'html'
        : /\.(?:md|markdown)$/i.test(path)
          ? 'markdown'
          : null;
      if (!kind) return;
      event.preventDefault();
      window.parent.postMessage({ type: 'mdhere:story-navigation', href, path, kind }, '*');
    } catch {
      /* Leave an invalid anchor inert under the frame's navigation policy. */
    }
  });
}
