'use strict';
// External handlers work with script-src 'self'; inline onerror does not.
document.querySelectorAll('img[data-hide-on-error]').forEach(image => {
  const fallback = () => {
    image.style.display = 'none';
    if (image.hasAttribute('data-image-fallback') && image.nextElementSibling) image.nextElementSibling.style.display = 'flex';
  };
  image.addEventListener('error', fallback, { once: true });
  if (image.complete && image.naturalWidth === 0) fallback();
});
