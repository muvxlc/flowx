export class MockElement {
  id: string = '';
  tagName: string = 'DIV';
  className: string = '';
  innerHTMLInternal: string = '';
  textContent: string = '';
  value: string = '';
  checked: boolean = false;
  type: string = '';
  files: Array<{ name: string; text: () => Promise<string> }> = [];
  style: Record<string, string> = {};
  attributes: Map<string, string> = new Map();
  listeners: Map<string, Array<(event?: unknown) => void>> = new Map();
  children: MockElement[] = [];

  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  get innerHTML(): string {
    return this.innerHTMLInternal;
  }

  set innerHTML(html: string) {
    this.innerHTMLInternal = html;
    this.children = parseHtmlToElements(html);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
    if (name === 'type') this.type = value;
    if (name === 'value') this.value = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  classList = {
    toggle: (cls: string, force?: boolean) => {
      const classes = new Set(this.className.split(' ').filter(Boolean));
      const shouldAdd = force !== undefined ? force : !classes.has(cls);
      if (shouldAdd) classes.add(cls);
      else classes.delete(cls);
      this.className = Array.from(classes).join(' ');
    },
    contains: (cls: string) => this.className.split(' ').includes(cls),
  };

  addEventListener(event: string, handler: (event?: unknown) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  async click(): Promise<void> {
    const handlers = this.listeners.get('click') ?? [];
    for (const h of handlers) {
      await h({ target: this, type: 'click', preventDefault: () => {} });
    }
  }

  async trigger(event: string, eventObj: Record<string, unknown> = {}): Promise<void> {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) {
      await h({ target: this, type: event, preventDefault: () => {}, ...eventObj });
    }
  }

  appendChild(child: MockElement): void {
    this.children.push(child);
  }

  focus(): void {}

  querySelector<T extends MockElement = MockElement>(selector: string): T | null {
    return (findFirst(this, selector) as T) ?? null;
  }

  querySelectorAll<T extends MockElement = MockElement>(selector: string): T[] {
    const results: MockElement[] = [];
    findAll(this, selector, results);
    return results as T[];
  }
}

function parseHtmlToElements(html: string): MockElement[] {
  const elements: MockElement[] = [];
  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>([^<]*)/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1]!;
    const attrString = match[2]!;
    const textAfter = (match[3] ?? '').trim();
    if (tagName.startsWith('/')) continue;

    const el = new MockElement(tagName);
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      const attrName = attrMatch[1]!;
      const attrVal = attrMatch[2] ?? '';
      el.setAttribute(attrName, attrVal);
    }

    if (textAfter) {
      el.textContent = textAfter;
      if (tagName.toLowerCase() === 'textarea') {
        el.value = textAfter;
      }
    }
    elements.push(el);
  }
  return elements;
}

function matchesSelector(el: MockElement, selector: string): boolean {
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  const tagMatch = selector.match(/^([a-zA-Z0-9-]+)/);
  if (tagMatch && el.tagName.toLowerCase() !== tagMatch[1]!.toLowerCase()) {
    return false;
  }
  const attrRegex = /\[([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?\]/g;
  let attrMatch: RegExpExecArray | null;
  let hasAttr = false;
  while ((attrMatch = attrRegex.exec(selector)) !== null) {
    hasAttr = true;
    const attrName = attrMatch[1]!;
    const attrVal = attrMatch[2];
    if (attrVal !== undefined) {
      if (el.getAttribute(attrName) !== attrVal) return false;
    } else {
      if (!el.attributes.has(attrName)) return false;
    }
  }
  if (hasAttr) return true;
  return tagMatch ? true : el.tagName.toLowerCase() === selector.toLowerCase();
}

function findFirst(root: MockElement, selector: string): MockElement | null {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) return child;
    const found = findFirst(child, selector);
    if (found) return found;
  }
  return null;
}

function findAll(root: MockElement, selector: string, results: MockElement[]): void {
  for (const child of root.children) {
    if (matchesSelector(child, selector)) results.push(child);
    findAll(child, selector, results);
  }
}

export function setupMockDocument() {
  const elementsById = new Map<string, MockElement>();

  const panelContent = new MockElement('main', 'panel-content');
  const statusIndicator = new MockElement('div', 'worker-status-indicator');
  const statusText = new MockElement('span', 'worker-status-text');
  const tabQueue = new MockElement('button', 'tab-queue');
  const tabCreate = new MockElement('button', 'tab-create');
  const tabDownloads = new MockElement('button', 'tab-downloads');
  const tabSettings = new MockElement('button', 'tab-settings');

  elementsById.set('panel-content', panelContent);
  elementsById.set('worker-status-indicator', statusIndicator);
  elementsById.set('worker-status-text', statusText);
  elementsById.set('tab-queue', tabQueue);
  elementsById.set('tab-create', tabCreate);
  elementsById.set('tab-downloads', tabDownloads);
  elementsById.set('tab-settings', tabSettings);

  const doc = {
    readyState: 'complete',
    getElementById: (id: string) => elementsById.get(id) ?? null,
    createElement: (tag: string) => new MockElement(tag),
    addEventListener: () => {},
  };

  (globalThis as unknown as { document: unknown }).document = doc;
  return { panelContent, statusText, statusIndicator, tabQueue, tabCreate, tabSettings };
}
