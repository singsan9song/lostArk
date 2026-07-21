import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import CharacterPage from './pages/CharacterPage'
import HellRewardPage from './pages/HellRewardPage'
import SingleCoinPage from './pages/SingleCoinPage'
import RaidExtraPage from './pages/RaidExtraPage'
import ArkPassPage from './pages/ArkPassPage'
import MariShopPage from './pages/MariShopPage'
import EventShopPage from './pages/EventShopPage'
import OtherEfficiencyPage from './pages/OtherEfficiencyPage'
import HoningPage from './pages/HoningPage'
import ExpeditionPage from './pages/ExpeditionPage'
import RapportPage from './pages/RapportPage'
import CommunityPage from './pages/CommunityPage'
import CommunityPostPage from './pages/CommunityPostPage'
import { setLocalData } from './lib/localData'

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
          <Route path="/" element={<HomePage />} />
          <Route path="/characters/:characterName" element={<CharacterPage />} />
          <Route path="/hell-reward" element={<HellRewardPage />} />
          <Route path="/single-coin" element={<SingleCoinPage />} />
          <Route path="/raid-extra" element={<RaidExtraPage />} />
          <Route path="/ark-pass" element={<ArkPassPage />} />
          <Route path="/mari-shop" element={<MariShopPage />} />
          <Route path="/event-shop" element={<EventShopPage />} />
          <Route path="/other-efficiency" element={<OtherEfficiencyPage />} />
          <Route path="/honing" element={<Navigate to="/honing/optimizer" replace />} />
          <Route path="/honing/optimizer" element={<HoningPage mode="optimizer" />} />
          <Route path="/honing/special" element={<HoningPage mode="special" />} />
          <Route path="/honing/support" element={<HoningPage mode="support" />} />
          <Route path="/expedition" element={<ExpeditionPage />} />
          <Route path="/rapport" element={<RapportPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/community/:postId" element={<CommunityPostPage />} />
          <Route path="/tools/hell-reward" element={<Navigate to="/hell-reward" replace />} />
          <Route path="/tools/single-coin" element={<Navigate to="/single-coin" replace />} />
          <Route path="/tools/raid-extra" element={<Navigate to="/raid-extra" replace />} />
          <Route path="/tools/ark-pass" element={<Navigate to="/ark-pass" replace />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
