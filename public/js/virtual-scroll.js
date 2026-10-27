import { describeEvent, formatClockMs, typeClass } from './format.js';

/**
 * Virtualised event log: only the rows in (or near) the viewport exist in the DOM.
 * Items are stored oldest-first (O(1) append) and displayed newest-first.
 */
export class VirtualScroller {
    /**
     * @param {HTMLElement} viewport scrollable element
     * @param {HTMLElement} content element sized to the full list height
     * @param {number} rowHeight px
     * @param {{ maxItems?: number, onCountChange?: (count: number) => void }} [options]
     */
    constructor(viewport, content, rowHeight, { maxItems = 100_000, onCountChange } = {}) {
        this.viewport = viewport;
        this.content = content;
        this.rowHeight = rowHeight;
        this.maxItems = maxItems;
        this.onCountChange = onCountChange;
        /** @type {any[]} */
        this.items = [];
        /** @type {HTMLElement[]} */
        this.pool = [];
        this.frame = 0;

        this.viewport.addEventListener('scroll', () => this.scheduleRender(), { passive: true });
        new ResizeObserver(() => this.scheduleRender()).observe(this.viewport);
        this.scheduleRender();
    }

    get length() {
        return this.items.length;
    }

    /** @param {number} displayIndex 0 = newest */
    itemAt(displayIndex) {
        return this.items[this.items.length - 1 - displayIndex];
    }

    /** @param {any[]} batch events, oldest first */
    appendMany(batch) {
        if (batch.length === 0) return;
        const before = this.items.length;
        for (const item of batch) this.items.push(item);
        if (this.items.length > this.maxItems * 1.1) {
            this.items.splice(0, this.items.length - this.maxItems);
        }
        // Keep what the user is reading in place when they are scrolled away from the top.
        const added = this.items.length - before;
        if (this.viewport.scrollTop > 0 && added > 0) {
            this.viewport.scrollTop += added * this.rowHeight;
        }
        this.scheduleRender();
    }

    clear() {
        this.items = [];
        this.viewport.scrollTop = 0;
        this.scheduleRender();
    }

    scheduleRender() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.render();
        });
    }

    /** @param {HTMLElement} row @param {any} item @param {number} index */
    fillRow(row, item, index) {
        row.style.transform = `translateY(${index * this.rowHeight}px)`;
        row.setAttribute('aria-rowindex', String(index + 2));
        if (row.__item === item) return;
        row.__item = item;
        const [time, type, detail] = /** @type {HTMLElement[]} */ (Array.from(row.children));
        time.textContent = formatClockMs(item.timestamp);
        type.className = `col-span-3 truncate font-medium sm:col-span-2 ${typeClass(item.type)}`;
        type.textContent = item.isSimulated ? `${item.type} · sim` : item.type;
        type.title = item.isSimulated ? `${item.type} (simulated data)` : item.type;
        detail.textContent = describeEvent(item);
        detail.title = detail.textContent;
    }

    createRow() {
        const row = document.createElement('div');
        row.setAttribute('role', 'row');
        row.className =
            'absolute left-0 top-0 grid w-full grid-cols-12 items-center gap-3 border-b border-slate-700/50 px-3 text-xs sm:text-sm';
        row.style.height = `${this.rowHeight}px`;
        for (const cls of [
            'col-span-4 truncate font-mono text-slate-400 sm:col-span-3',
            'col-span-3 truncate font-medium sm:col-span-2',
            'col-span-5 truncate text-slate-300 sm:col-span-7',
        ]) {
            const cell = document.createElement('div');
            cell.setAttribute('role', 'cell');
            cell.className = cls;
            row.appendChild(cell);
        }
        return row;
    }

    render() {
        const total = this.items.length;
        this.content.style.height = `${total * this.rowHeight}px`;
        this.onCountChange?.(total);

        const scrollTop = this.viewport.scrollTop;
        const height = this.viewport.clientHeight;
        const first = Math.max(0, Math.floor(scrollTop / this.rowHeight) - 4);
        const last = Math.min(total, Math.ceil((scrollTop + height) / this.rowHeight) + 4);
        const needed = Math.max(0, last - first);

        while (this.pool.length < needed) {
            const row = this.createRow();
            this.pool.push(row);
            this.content.appendChild(row);
        }
        this.pool.forEach((row, i) => {
            if (i < needed) {
                row.hidden = false;
                this.fillRow(row, this.itemAt(first + i), first + i);
            } else {
                row.hidden = true;
            }
        });
    }
}
