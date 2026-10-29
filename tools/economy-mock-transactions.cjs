'use strict';
// Failure-injectable transaction simulator. No production DB or chain is contacted.
module.exports = function install(ctx, models, objects = []) {
  let tail = Promise.resolve();
  const clone = x => JSON.parse(JSON.stringify(x));
  for (const m of models) {
    for (const name of ['find', 'findOne', 'findById', 'findOneAndUpdate']) {
      if (!m[name]) continue;
      const old = m[name];
      m[name] = (...args) => { const q = old(...args); if (q && typeof q === 'object') q.session = () => q; return q; };
    }
    if (m.create) {
      const old = m.create;
      m.create = async (d, ...args) => {
        if (m._failNext === 'create') { delete m._failNext; throw new Error('injected_write_failure'); }
        if (Array.isArray(d)) { const out = []; for (const x of d) out.push(await old(x, ...args)); return out; }
        return old(d, ...args);
      };
    }
  }
  ctx.mongoose.startSession = async () => ({
    endSession: async () => {},
    withTransaction: async fn => {
      const previous = tail; let done; tail = new Promise(r => { done = r; }); await previous;
      const snapshots = models.filter(m => m._t).map(m => [m._t, clone(m._t)]);
      const objectSnapshots = objects.map(o => [o, clone(o)]);
      try { return await fn(); }
      catch (e) {
        for (const [arr, before] of snapshots) arr.splice(0, arr.length, ...before);
        for (const [obj, before] of objectSnapshots) { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, before); }
        throw e;
      } finally { done(); }
    }
  });
};
