/**
 * Fixed-capacity FIFO buffer with O(1) push. Oldest items are overwritten.
 * @template T
 */
export class RingBuffer {
    /** @param {number} capacity */
    constructor(capacity) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new RangeError('capacity must be a positive integer');
        }
        this.capacity = capacity;
        /** @type {(T | undefined)[]} */
        this.items = new Array(capacity);
        this.start = 0;
        this.size = 0;
    }

    /** @param {T} item */
    push(item) {
        const index = (this.start + this.size) % this.capacity;
        this.items[index] = item;
        if (this.size < this.capacity) {
            this.size += 1;
        } else {
            this.start = (this.start + 1) % this.capacity;
        }
    }

    /**
     * Returns up to `limit` most recent items, oldest first.
     * @param {number} [limit]
     * @returns {T[]}
     */
    last(limit = this.size) {
        const count = Math.max(0, Math.min(limit, this.size));
        /** @type {T[]} */
        const out = [];
        for (let i = this.size - count; i < this.size; i++) {
            out.push(/** @type {T} */ (this.items[(this.start + i) % this.capacity]));
        }
        return out;
    }
}
