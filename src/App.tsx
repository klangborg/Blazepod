import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PodProvider } from './app/PodContext'
import { Layout } from './components/Layout'
import { DiagnosticsPage } from './pages/DiagnosticsPage'
import { ExerciseEditorPage } from './pages/ExerciseEditorPage'
import { ExercisesPage } from './pages/ExercisesPage'
import { HistoryPage } from './pages/HistoryPage'
import { LiveSessionPage } from './pages/LiveSessionPage'
import { PodsPage } from './pages/PodsPage'
import { ResultPage } from './pages/ResultPage'

export function App() {
  return (
    <HashRouter>
      <PodProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<PodsPage />} />
            <Route path="/diagnostics" element={<DiagnosticsPage />} />
            <Route path="/exercises" element={<ExercisesPage />} />
            <Route path="/exercises/new" element={<ExerciseEditorPage />} />
            <Route path="/exercises/:id/edit" element={<ExerciseEditorPage />} />
            <Route path="/session/:exerciseId" element={<LiveSessionPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:id" element={<ResultPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </PodProvider>
    </HashRouter>
  )
}
