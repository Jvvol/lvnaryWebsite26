// Thanks page: show the order number from Stripe's return link and empty the bag, since it's paid for.
(() => {
  const order = new URLSearchParams(location.search).get('order') || '';
  if (/^LV-[A-Z0-9]{6}$/.test(order)) {
    document.getElementById('orderNumber').textContent = order;
    document.getElementById('thanksOrder').hidden = false;
  }
  try { localStorage.removeItem('lvnary-bag'); } catch { /* storage blocked */ }
})();
