/**
 * Timing utility for measuring async operation latency
 * @param {string} label - Label for the operation
 * @param {Function} fn - Async function to measure
 * @returns {Promise<{val: any, ms: number}>} Result and elapsed time
 */
export function time(label, fn) {
  const t0 = Date.now();
  return Promise.resolve()
    .then(fn)
    .then((val) => ({ val, ms: Date.now() - t0 }))
    .catch((err) => {
      err.ms = Date.now() - t0;
      throw err;
    });
}
