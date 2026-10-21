const ORIGIN = 'http://localhost:4317';

// Every page of the site. Extended as pages are added.
const PAGES = ['/', '/privacy/', '/cookies/', '/terms/', '/accessibility/', '/do-not-sell/', '/404.html'];

// Collects URLs of requests that leave the local server.
function externalRequests(page) {
  const urls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (new URL(url).origin !== ORIGIN) urls.push(url);
  });
  return urls;
}

module.exports = { ORIGIN, PAGES, externalRequests };
