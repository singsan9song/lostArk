// Spawns a fresh honing-worker for one calculation request. A dedicated worker per request
// (rather than one shared long-lived worker) keeps this simple: there's no message queue or
// request-id matching to get wrong, and a timed-out or superseded request can just terminate
// its own worker without disturbing any other in-flight request.
export const HONING_TIMEOUT_MS = 30000

// Returns { promise, cancel } instead of a bare promise so a caller that starts a newer
// calculation (grade/support toggle changed mid-flight) can terminate the stale worker instead
// of just letting it burn CPU in the background until it finishes or times out.
export function runHoningCalculation(payload, { timeoutMs = HONING_TIMEOUT_MS } = {}) {
  const worker = new Worker(new URL('./honingWorker.js', import.meta.url), { type: 'module' })
  let settled = false
  let timer

  const promise = new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      fn(value)
    }

    timer = setTimeout(() => {
      finish(reject, new Error('TIMEOUT'))
    }, timeoutMs)

    worker.onmessage = (event) => {
      if (event.data.status === 'done') finish(resolve, event.data.result)
      else finish(reject, new Error(event.data.message || '계산 중 오류가 발생했습니다.'))
    }
    worker.onerror = (error) => {
      finish(reject, error)
    }

    worker.postMessage(payload)
  })

  const cancel = () => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    worker.terminate()
  }

  return { promise, cancel }
}
