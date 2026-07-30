import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { setLocalData } from './lib/localData'

const HomePage = lazy(() => import('./pages/HomePage'))
const CharacterPage = lazy(() => import('./pages/CharacterPage'))
const HellRewardPage = lazy(() => import('./pages/HellRewardPage'))
const SingleCoinPage = lazy(() => import('./pages/SingleCoinPage'))
const RaidExtraPage = lazy(() => import('./pages/RaidExtraPage'))
const ArkPassPage = lazy(() => import('./pages/ArkPassPage'))
const MariShopPage = lazy(() => import('./pages/MariShopPage'))
const EventShopPage = lazy(() => import('./pages/EventShopPage'))
const OtherEfficiencyPage = lazy(() => import('./pages/OtherEfficiencyPage'))
const HoningOptimizerPage = lazy(() => import('./pages/HoningOptimizerPage'))
const AdvancedHoningOptimizerPage = lazy(() => import('./pages/AdvancedHoningOptimizerPage'))
const IntegratedHoningOptimizerPage = lazy(() => import('./pages/IntegratedHoningOptimizerPage'))
const SpecialHoningPage = lazy(() => import('./pages/SpecialHoningPage'))
const ExpeditionPage = lazy(() => import('./pages/ExpeditionPage'))
const RapportPage = lazy(() => import('./pages/RapportPage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const CommunityPostPage = lazy(() => import('./pages/CommunityPostPage'))
const RankingPage = lazy(() => import('./pages/RankingPage'))

function PageFallback() {
  return <div className="route-loading">페이지를 불러오는 중입니다.</div>
}

const page = (Component) => (
  <Suspense fallback={<PageFallback />}>
    <Component />
  </Suspense>
)

export default function App() {
  const [light, setLight] = useState(() => localStorage.getItem('loark-theme') === 'light')

  useEffect(() => {
    document.body.classList.toggle('light', light)
    setLocalData('loark-theme', light ? 'light' : 'dark')
  }, [light])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout light={light} setLight={setLight} />}>
          <Route path="/" element={page(HomePage)} />
          <Route path="/characters/:characterName" element={page(CharacterPage)} />
          <Route path="/hell-reward" element={page(HellRewardPage)} />
          <Route path="/single-coin" element={page(SingleCoinPage)} />
          <Route path="/raid-extra" element={page(RaidExtraPage)} />
          <Route path="/ark-pass" element={page(ArkPassPage)} />
          <Route path="/mari-shop" element={page(MariShopPage)} />
          <Route path="/event-shop" element={page(EventShopPage)} />
          <Route path="/other-efficiency" element={page(OtherEfficiencyPage)} />
          <Route path="/honing-optimizer" element={page(HoningOptimizerPage)} />
          <Route path="/advanced-honing-optimizer" element={page(AdvancedHoningOptimizerPage)} />
          <Route
            path="/integrated-honing-optimizer"
            element={page(IntegratedHoningOptimizerPage)}
          />
          <Route path="/special-honing" element={page(SpecialHoningPage)} />
          <Route path="/expedition" element={page(ExpeditionPage)} />
          <Route path="/rapport" element={page(RapportPage)} />
          <Route path="/community" element={page(CommunityPage)} />
          <Route path="/community/:postId" element={page(CommunityPostPage)} />
          <Route path="/rankings" element={page(RankingPage)} />
          <Route path="/tools/hell-reward" element={<Navigate to="/hell-reward" replace />} />
          <Route path="/tools/single-coin" element={<Navigate to="/single-coin" replace />} />
          <Route path="/tools/raid-extra" element={<Navigate to="/raid-extra" replace />} />
          <Route path="/tools/ark-pass" element={<Navigate to="/ark-pass" replace />} />
          <Route path="*" element={page(HomePage)} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
