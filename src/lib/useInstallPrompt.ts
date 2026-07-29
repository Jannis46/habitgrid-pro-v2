import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Gemeinsame Grundlage für alle Installationshinweise.
 *
 * Chrome und Edge liefern `beforeinstallprompt` und erlauben einen echten
 * Systemdialog. Safari auf iOS tut das nicht — dort bleibt nur die Anleitung über
 * das Teilen-Menü. Beide Fälle müssen abgedeckt sein, sonst steht iOS-Nutzern ein
 * Knopf gegenüber, der nichts tut.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // sonst zeigt der Browser seinen eigenen Balken zum falschen Zeitpunkt
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS meldet den Vollbildmodus über eine eigene, nicht standardisierte Eigenschaft
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  // `navigator.platform` ist abgekündigt; iPadOS ab 13 meldet sich ohnehin als Mac,
  // erkennbar nur an den Touchpunkten.
  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

  const install = async (): Promise<boolean> => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    return outcome === 'accepted'
  }

  return {
    /** Systemdialog verfügbar (Chrome, Edge, Android) */
    canPrompt: Boolean(deferred),
    /** Läuft bereits als installierte App — dann ist jeder Hinweis überflüssig */
    standalone: standalone || installed,
    isIos,
    install,
  }
}
