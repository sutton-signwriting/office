// Local SVG navigation: no external map service, location or account requests.
export function setupMapNavigation(svg, onSelect) {
  const world = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  let view = [...world];
  const maxZoom = 64;
  const pointers = new Map();
  let moved = false;
  let initial;
  let suppressClickUntil = 0;
  const zoomIn = document.querySelector('#map-zoom-in');
  const zoomOut = document.querySelector('#map-zoom-out');
  const reset = document.querySelector('#map-reset');
  const level = document.querySelector('#map-zoom-level');
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const scale = () => world[2] / view[2];
  const render = () => {
    view[0] = clamp(view[0], world[0], world[0] + world[2] - view[2]);
    view[1] = clamp(view[1], world[1], world[1] + world[3] - view[3]);
    svg.setAttribute('viewBox', view.join(' '));
    svg.dataset.zoom = String(scale());
    zoomIn.disabled = scale() >= maxZoom;
    zoomOut.disabled = scale() <= 1;
    level.textContent = new Intl.NumberFormat(document.documentElement.lang, {maximumFractionDigits: 1}).format(scale()) + '×';
  };
  const point = (x, y) => {
    const rect = svg.getBoundingClientRect();
    return [(x - rect.left) / rect.width, (y - rect.top) / rect.height];
  };
  const zoom = (factor, anchor = [.5, .5]) => {
    const next = clamp(scale() * factor, 1, maxZoom);
    const width = world[2] / next;
    const height = world[3] / next;
    view = [view[0] + (view[2] - width) * anchor[0], view[1] + (view[3] - height) * anchor[1], width, height];
    render();
  };
  const pan = (dx, dy) => {
    const rect = svg.getBoundingClientRect();
    view[0] -= dx / rect.width * view[2];
    view[1] -= dy / rect.height * view[3];
    render();
  };
  zoomIn.addEventListener('click', () => zoom(2));
  zoomOut.addEventListener('click', () => zoom(.5));
  reset.addEventListener('click', () => { view = [...world]; render(); });
  svg.addEventListener('wheel', event => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1);
    zoom(Math.exp(-clamp(pixels, -240, 240) * .005), point(event.clientX, event.clientY));
  }, {passive: false});
  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.size === 1) {
      moved = false;
      initial = {x: event.clientX, y: event.clientY, country: event.target.closest('.map-country[data-country]')?.dataset.country};
    } else moved = true;
    svg.setPointerCapture(event.pointerId);
    svg.classList.add('is-dragging');
  });
  const center = points => [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
  const distance = points => Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
  svg.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const previous = [...pointers.values()];
    const old = pointers.get(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (Math.hypot(event.clientX - initial.x, event.clientY - initial.y) > 5) moved = true;
    if (pointers.size >= 2) {
      const next = [...pointers.values()];
      const oldCenter = center(previous);
      const nextCenter = center(next);
      const oldDistance = distance(previous);
      if (oldDistance > 0) zoom(distance(next) / oldDistance, point(...oldCenter));
      pan(nextCenter[0] - oldCenter[0], nextCenter[1] - oldCenter[1]);
    } else if (moved && scale() > 1) pan(event.clientX - old[0], event.clientY - old[1]);
  });
  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    const wasTap = event.type === 'pointerup' && !moved && pointers.size === 1;
    pointers.delete(event.pointerId);
    suppressClickUntil = performance.now() + 500;
    if (wasTap && initial.country) onSelect(initial.country);
    if (!pointers.size) svg.classList.remove('is-dragging');
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('lostpointercapture', endPointer);
  svg.addEventListener('click', event => {
    // Ignore compatibility clicks after drag/pinch/tap; assistive activation still works.
    if (performance.now() < suppressClickUntil) return;
    const country = event.target.closest('.map-country[data-country]')?.dataset.country;
    if (country) onSelect(country);
  });
  svg.addEventListener('keydown', event => {
    if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') reset.click();
      else zoom(event.key === '-' ? .5 : 2);
    }
  });
  svg.addEventListener('focusin', event => {
    if (scale() === 1 || !event.target.matches('.map-country[data-country]')) return;
    const box = event.target.getBBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (x < view[0] || x > view[0] + view[2] || y < view[1] || y > view[1] + view[3]) {
      view[0] = x - view[2] / 2;
      view[1] = y - view[3] / 2;
      render();
    }
  });
  render();
  return {refresh: render};
}
