# ME2.8 Drift Analyzer — React Tool

Das fertige Browser-Tool liegt in `/src/ME28_Drift_Analyzer.jsx` im GitHub-Repository.

## Verwendung

```bash
npm install
npm run dev       # Entwicklung
npm run build     # Produktions-Build → /dist
```

## Deployment

Das Projekt ist mit GitHub Actions für automatisches Deployment auf GitHub Pages konfiguriert.
Jeder Push auf `main` triggert automatisch einen Build und Deploy.

Live-URL nach Deployment: `https://[github-user].github.io/me28-drift-analyzer/`

## Architektur

- **Framework**: React 18 + Vite
- **Keine externen Abhängigkeiten** für die Analyse — reines JavaScript/Uint8Array
- **Datenschutz**: Alle Verarbeitung im Browser, keine Netzwerkanfragen
- **Unterstützte Dateiformate**: `.bin`, `.FLS` (exakt 524288 Bytes)

## Erweiterungspunkte

- `PARAMS` Array: neue Parameter hinzufügen
- `MAPS` Array: neue Kennfelder hinzufügen  
- `SW_VARIANTS` Objekt: neue SW-Versionen mit Adressversatz
- `analyzeParam()` / `analyzeMap()`: Analyse-Logik erweitern
