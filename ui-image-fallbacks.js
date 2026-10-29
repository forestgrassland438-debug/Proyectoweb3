 'use strict';
// Captured resource errors also cover images inserted after initial startup.
function gfHideBrokenImage(image) {
  if (!image?.matches?.('img[data-hide-on-error]')) return;
  image.style.display='none';
  if(image.hasAttribute('data-image-fallback') && image.nextElementSibling)image.nextElementSibling.style.display='flex';
}
document.addEventListener('error',event=>gfHideBrokenImage(event.target),true);
document.querySelectorAll('img[data-hide-on-error]').forEach(image=>{if(image.complete && image.naturalWidth===0)gfHideBrokenImage(image);});
