/**
 * Simple, fast interactive JSON tree viewer with expand/collapse and syntax coloring
 */
function renderJsonTree(data, container) {
  container.innerHTML = '';
  const treeRoot = document.createElement('div');
  treeRoot.className = 'json-tree';

  let parsed = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch (_) {
      // Raw string fallback
      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-all';
      pre.textContent = data;
      container.appendChild(pre);
      return;
    }
  }

  treeRoot.appendChild(createNode(null, parsed, true));
  container.appendChild(treeRoot);
}

function createNode(key, value, isRoot = false) {
  const line = document.createElement('div');
  line.style.paddingLeft = isRoot ? '0px' : '16px';
  line.style.margin = '2px 0';

  const keySpan = key !== null ? `<span class="json-key">"${escapeHtml(key)}"</span>: ` : '';

  if (value === null) {
    line.innerHTML = `${keySpan}<span class="json-null">null</span>`;
    return line;
  }

  const type = typeof value;

  if (type === 'string') {
    line.innerHTML = `${keySpan}<span class="json-string">"${escapeHtml(value)}"</span>`;
    return line;
  }

  if (type === 'number') {
    line.innerHTML = `${keySpan}<span class="json-number">${value}</span>`;
    return line;
  }

  if (type === 'boolean') {
    line.innerHTML = `${keySpan}<span class="json-boolean">${value}</span>`;
    return line;
  }

  if (Array.isArray(value)) {
    const isExpandable = value.length > 0;
    const header = document.createElement('div');
    header.style.cursor = isExpandable ? 'pointer' : 'default';

    const toggle = isExpandable ? '<span class="json-toggle">▼</span>' : '';
    header.innerHTML = `${toggle}${keySpan}[ <span style="color: #64748b;">${value.length} items</span> ]`;

    const childrenContainer = document.createElement('div');
    childrenContainer.style.display = 'block';

    if (isExpandable) {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = childrenContainer.style.display !== 'none';
        childrenContainer.style.display = isOpen ? 'none' : 'block';
        header.querySelector('.json-toggle').textContent = isOpen ? '▶' : '▼';
      });

      value.forEach((item, idx) => {
        childrenContainer.appendChild(createNode(idx, item));
      });
    }

    line.appendChild(header);
    line.appendChild(childrenContainer);
    return line;
  }

  if (type === 'object') {
    const keys = Object.keys(value);
    const isExpandable = keys.length > 0;
    const header = document.createElement('div');
    header.style.cursor = isExpandable ? 'pointer' : 'default';

    const toggle = isExpandable ? '<span class="json-toggle">▼</span>' : '';
    header.innerHTML = `${toggle}${keySpan}{ <span style="color: #64748b;">${keys.length} keys</span> }`;

    const childrenContainer = document.createElement('div');
    childrenContainer.style.display = 'block';

    if (isExpandable) {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = childrenContainer.style.display !== 'none';
        childrenContainer.style.display = isOpen ? 'none' : 'block';
        header.querySelector('.json-toggle').textContent = isOpen ? '▶' : '▼';
      });

      keys.forEach((k) => {
        childrenContainer.appendChild(createNode(k, value[k]));
      });
    }

    line.appendChild(header);
    line.appendChild(childrenContainer);
    return line;
  }

  line.innerHTML = `${keySpan}<span>${String(value)}</span>`;
  return line;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
