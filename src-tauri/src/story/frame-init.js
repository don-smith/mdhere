// Installed by the app at document start, not imported by author files.
if (window !== window.top && location.protocol === 'mdhere-story:') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      document.documentElement.dataset.mdhereStory = 'isolated';
    },
    { once: true }
  );
}
