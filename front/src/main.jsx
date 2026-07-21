import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import '../styles.css'
import './character.css'
import './pages.css'
import './character-v2.css'
import './profile-card.css'
import './battle.css'
import './avatar.css'
import './skill.css'
import './roster.css'
import './tool-pages.css'
import './single-coin.css'
import './favorites.css'
import './home-dashboard.css'
import './grade-overrides.css'
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
