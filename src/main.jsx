import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ME28Analyzer from './ME28_Drift_Analyzer.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ME28Analyzer />
  </StrictMode>,
)
