import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { StoreProvider } from './lib/store.jsx'
import Shell from './components/Shell.jsx'
import Landing from './pages/Landing.jsx'
import Welcome from './pages/Welcome.jsx'
import SignIn from './pages/SignIn.jsx'
import Home from './pages/Home.jsx'
import SavedLocations from './pages/SavedLocations.jsx'
import Practice from './pages/Practice.jsx'
import Rules from './pages/Rules.jsx'
import Lightning from './pages/Lightning.jsx'
import Weather from './pages/Weather.jsx'

export default function App() {
  return (
    <StoreProvider>
      {/* Hash routing so the build works on static hosting without server rewrites. */}
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/app" element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="locations" element={<SavedLocations />} />
            <Route path="practice" element={<Practice />} />
            <Route path="weather" element={<Weather />} />
            <Route path="rules" element={<Rules />} />
            <Route path="lightning" element={<Lightning />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </StoreProvider>
  )
}
