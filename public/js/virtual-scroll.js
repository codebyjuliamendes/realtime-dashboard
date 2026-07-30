export class VirtualScroller {
    constructor(viewportElement, contentElement, rowHeight, initialData = []) {
        this.viewport = viewportElement;
        this.content = contentElement;
        this.rowHeight = rowHeight;
        this.data = initialData;
        
        this.visibleNodes = [];
        this.scrollTop = 0;
        
        this.viewport.addEventListener('scroll', () => {
            this.scrollTop = this.viewport.scrollTop;
            this.render();
        }, { passive: true });
        
        // Use ResizeObserver to handle container resizes
        this.resizeObserver = new ResizeObserver(() => {
            this.render();
        });
        this.resizeObserver.observe(this.viewport);
        
        this.updateHeight();
        this.render();
    }
    
    appendData(item) {
        this.data.unshift(item); // Add to top for event log behavior
        // Cap at 100k
        if (this.data.length > 100000) {
            this.data.pop();
        }
        this.updateHeight();
        
        // If we are at the top, force re-render to show new item
        if (this.scrollTop === 0) {
            this.render();
        }
    }
    
    updateHeight() {
        this.content.style.height = `${this.data.length * this.rowHeight}px`;
    }
    
    createRow(item, top) {
        const div = document.createElement('div');
        div.className = 'absolute w-full grid grid-cols-12 gap-4 px-3 py-2 border-b border-slate-700/50 hover:bg-slate-800/50 text-sm transition-colors items-center';
        div.style.top = `${top}px`;
        div.style.height = `${this.rowHeight}px`;
        
        const timeCol = document.createElement('div');
        timeCol.className = 'col-span-3 text-slate-400 font-mono truncate';
        const d = new Date(item.timestamp);
        timeCol.textContent = d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0');
        
        const typeCol = document.createElement('div');
        let typeClass = 'text-slate-200';
        if (item.type === 'crypto') typeClass = 'text-yellow-400';
        else if (item.type === 'telemetry') typeClass = 'text-cyan-400';
        else if (item.type === 'alert') typeClass = 'text-red-400';
        typeCol.className = `col-span-2 font-medium truncate ${typeClass}`;
        typeCol.textContent = item.type;
        
        const detailCol = document.createElement('div');
        detailCol.className = 'col-span-7 text-slate-300 truncate';
        detailCol.textContent = typeof item.data === 'object' ? JSON.stringify(item.data) : (item.message || '');
        
        div.appendChild(timeCol);
        div.appendChild(typeCol);
        div.appendChild(detailCol);
        
        return div;
    }
    
    render() {
        const viewportHeight = this.viewport.clientHeight;
        const startIndex = Math.max(0, Math.floor(this.scrollTop / this.rowHeight) - 2); // Buffer above
        const endIndex = Math.min(
            this.data.length,
            Math.floor((this.scrollTop + viewportHeight) / this.rowHeight) + 2 // Buffer below
        );
        
        // Remove old nodes not in range
        this.visibleNodes = this.visibleNodes.filter(node => {
            if (node.index < startIndex || node.index >= endIndex) {
                this.content.removeChild(node.el);
                return false;
            }
            return true;
        });
        
        // Add new nodes
        for (let i = startIndex; i < endIndex; i++) {
            if (!this.visibleNodes.some(node => node.index === i)) {
                const el = this.createRow(this.data[i], i * this.rowHeight);
                this.content.appendChild(el);
                this.visibleNodes.push({ index: i, el });
            }
        }
    }
}
