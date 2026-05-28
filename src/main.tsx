import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react'
import { ToastProvider } from './components/ui/Toast'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={{ size: 18, weight: 'regular' }}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </IconContext.Provider>
  </StrictMode>,
)
