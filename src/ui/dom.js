// Minimal DOM helper. No framework — the app re-renders on explicit actions
// only, so typing into a field never destroys it mid-keystroke.

export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    // Deliberately no innerHTML escape hatch: topic titles, encodings and recall
    // attempts are free text, and everything here goes through createTextNode.
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el && key !== 'list') {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }

  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG needs its own namespace. Building these with createElement produces
 * unknown HTML elements that parse fine and then draw nothing at all.
 */
export function svg(tag, props = null, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) if (child) el.append(child);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function copyText(text, button) {
  const done = () => {
    if (!button) return;
    const original = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = original; }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
  } else {
    fallback(text, done);
  }
}

function fallback(text, done) {
  const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
  document.body.append(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } finally {
    ta.remove();
  }
}
