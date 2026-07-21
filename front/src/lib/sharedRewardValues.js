import { lostArkApi } from './api'
import { setLocalData } from './localData'

// 같은 보상을 사용하는 페이지들이 동일한 조회 결과를 공유한다.
// 페이지 이동 때마다 별도로 조회하지 않으며, 실패한 요청만 다음 호출에서 재시도한다.
let abilityStoneValue = null
let abilityStoneRequest = null
const ABILITY_STONE_CONFIGURATION_KEY = 'loark.abilityStoneConfiguration'

export const getSharedAbilityStoneValue = ({ refresh = false } = {}) => {
  if (!refresh && abilityStoneValue) return Promise.resolve(abilityStoneValue)
  if (abilityStoneRequest) return abilityStoneRequest

  abilityStoneRequest = lostArkApi
    .getAbilityStoneAuctionValue()
    .then((result) => {
      if (!result?.configurations?.length)
        throw new Error('어빌리티 스톤 가격 조합이 비어 있습니다.')
      abilityStoneValue = result
      return result
    })
    .finally(() => {
      abilityStoneRequest = null
    })

  return abilityStoneRequest
}

export const highestAbilityStonePrice = (data) =>
  Math.max(
    0,
    ...(data?.configurations || []).map(
      (configuration) => Number(configuration.currentMinPrice) || 0,
    ),
  )

export const storedAbilityStoneConfigurationId = () =>
  typeof window === 'undefined'
    ? ''
    : window.localStorage.getItem(ABILITY_STONE_CONFIGURATION_KEY) || ''

export const storeAbilityStoneConfigurationId = (id) => {
  if (typeof window === 'undefined' || !id) return
  setLocalData(ABILITY_STONE_CONFIGURATION_KEY, id)
}

export const resolveAbilityStoneConfiguration = (data, selectedId) => {
  const configurations = data?.configurations || []
  return (
    configurations.find((configuration) => configuration.id === selectedId) ||
    configurations.find((configuration) => configuration.id === data?.selectedConfigurationId) ||
    configurations[0] ||
    null
  )
}
