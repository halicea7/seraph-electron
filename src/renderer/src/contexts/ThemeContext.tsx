import { createContext, useContext, useEffect, useState } from 'react'

export type Accent =
  | 'amber' | 'cyan' | 'signal-red' | 'electric-green' | 'violet'
  | 'azure' | 'teal' | 'magenta' | 'ember' | 'steel'
export type BgVariant = 'paper' | 'true-black' | 'midnight' | 'slate' | 'abyss' | 'nebula' | 'day'
export type Density = 'compact' | 'standard' | 'roomy'

// Legacy compat
export type Theme = 'blue' | 'mono'

interface ThemeContextValue {
  accent: Accent
  bg: BgVariant
  density: Density
  setAccent: (a: Accent) => void
  setBg: (b: BgVariant) => void
  setDensity: (d: Density) => void
  // Legacy — maps to accent='cyan' (blue) or accent='violet'+bg='true-black' (mono)
  theme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: 'amber',
  bg: 'paper',
  density: 'standard',
  setAccent: () => {},
  setBg: () => {},
  setDensity: () => {},
  theme: 'blue',
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(
    () => (localStorage.getItem('seraph_accent') as Accent) ?? 'amber'
  )
  const [bg, setBgState] = useState<BgVariant>(
    () => (localStorage.getItem('seraph_bg') as BgVariant) ?? 'paper'
  )
  const [density, setDensityState] = useState<Density>(
    () => (localStorage.getItem('seraph_density') as Density) ?? 'standard'
  )

  function setAccent(a: Accent) {
    setAccentState(a)
    localStorage.setItem('seraph_accent', a)
  }
  function setBg(b: BgVariant) {
    setBgState(b)
    localStorage.setItem('seraph_bg', b)
  }
  function setDensity(d: Density) {
    setDensityState(d)
    localStorage.setItem('seraph_density', d)
  }

  // Legacy setTheme — maps old theme names to new system
  function setTheme(t: Theme) {
    if (t === 'blue') { setAccent('cyan') }
    if (t === 'mono') { setAccent('violet'); setBg('true-black') }
  }

  const theme: Theme = (accent === 'cyan' && bg !== 'true-black') ? 'blue' : 'mono'

  useEffect(() => {
    const html = document.documentElement
    // New system
    if (accent === 'amber') { delete html.dataset.accent }
    else { html.dataset.accent = accent }

    if (bg === 'paper') { delete html.dataset.bg }
    else { html.dataset.bg = bg }

    if (density === 'standard') { delete html.dataset.density }
    else { html.dataset.density = density }

    // Legacy data-theme for any old CSS still referencing it
    html.dataset.theme = theme
  }, [accent, bg, density, theme])

  return (
    <ThemeContext.Provider value={{ accent, bg, density, setAccent, setBg, setDensity, theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
