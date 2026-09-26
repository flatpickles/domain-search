const queues = new Map();
function schedule(key, task, intervalMs = 0) {
  const state = queues.get(key) || { tail: Promise.resolve(), ready: 0 };
  queues.set(key,state);
  const run = async () => {
    const delay = Math.max(0,state.ready-Date.now());
    if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
    try { return await task(); } finally { state.ready=Date.now()+intervalMs; }
  };
  const pending=state.tail.then(run,run);
  state.tail=pending.catch(()=>{});
  return pending;
}
module.exports={schedule};
