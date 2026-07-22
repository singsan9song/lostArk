// Runs the honing optimizer's heavy computation (simulateRange + per-step strategy comparison)
// off the main thread, so the UI stays responsive and can show a real spinner while it works.
// One worker handles exactly one request then gets terminated by the caller — see
// honingWorkerClient.js — so there's no request-id bookkeeping needed here.
import { simulateRange, compareStrategies, findRecord } from './honingCalculator'
import { unitPriceOf } from './honingPricing'

self.onmessage = (event) => {
  const {
    equipmentType,
    grade,
    currentStage,
    targetStage,
    supportState,
    marketPrices,
    startProbability,
    startEnergy,
  } = event.data

  try {
    const getUnitPrice = (name) => unitPriceOf(name, marketPrices)
    const result = simulateRange({
      equipmentType,
      grade,
      currentStage,
      targetStage,
      supportState,
      getUnitPrice,
      startProbability,
      startEnergy,
    })

    // Attach each step's strategy comparison here (reusing the same record lookup) instead of
    // making the main thread recompute optimizeTransition again per render.
    const steps = result.steps.map((step) => {
      const record = findRecord(equipmentType, grade, step.toStage, supportState)
      if (!record) return { ...step, strategies: [] }
      const options =
        step.fromStage === currentStage ? { startProbability, startEnergy } : undefined
      return { ...step, strategies: compareStrategies(record, getUnitPrice, options) }
    })

    self.postMessage({ status: 'done', result: { ...result, steps } })
  } catch (error) {
    self.postMessage({ status: 'error', message: error?.message || String(error) })
  }
}
