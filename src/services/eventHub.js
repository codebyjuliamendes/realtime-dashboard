import { RingBuffer } from '../domain/ringBuffer.js';

/**
 * @typedef {'CRYPTO' | 'IOT' | 'SYSTEM' | 'SYSTEM_ERROR'} EventType
 *
 * @typedef {object} DashboardEvent
 * @property {EventType} type
 * @property {number} timestamp epoch ms when the server published the event
 * @property {string} source where the data came from: "coingecko", "simulator", "server"
 * @property {boolean} isSimulated true when the values are synthetic (demo generators)
 * @property {unknown} [data]
 * @property {string} [message]
 */

/**
 * Central publish/subscribe hub. Every event is stamped, persisted to the event store,
 * kept in a bounded in-memory buffer and fanned out to subscribers (WebSocket gateway).
 *
 * @param {object} options
 * @param {import('../infra/eventStore.js').EventStore} options.store
 * @param {number} options.bufferSize
 * @param {() => number} [options.now]
 */
export function createEventHub({ store, bufferSize, now = Date.now }) {
    /** @type {RingBuffer<DashboardEvent>} */
    const recent = new RingBuffer(bufferSize);
    /** @type {Set<(event: DashboardEvent) => void>} */
    const listeners = new Set();
    /** @type {Map<EventType, DashboardEvent>} */
    const latest = new Map();

    return {
        /**
         * @param {Omit<DashboardEvent, 'timestamp'> & { timestamp?: number }} input
         * @returns {DashboardEvent}
         */
        publish(input) {
            /** @type {DashboardEvent} */
            const event = { ...input, timestamp: input.timestamp ?? now() };
            store.append(event);
            recent.push(event);
            latest.set(event.type, event);
            for (const listener of listeners) listener(event);
            return event;
        },

        /** @param {(event: DashboardEvent) => void} listener @returns {() => void} unsubscribe */
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        /** @param {number} limit */
        getRecent(limit) {
            return recent.last(limit);
        },

        /** @param {EventType} type @returns {DashboardEvent | undefined} */
        getLatest(type) {
            return latest.get(type);
        },
    };
}

/** @typedef {ReturnType<typeof createEventHub>} EventHub */
