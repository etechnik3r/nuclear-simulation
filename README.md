# nuclear-simulation

Eine interaktive, **qualitative** Kernreaktor-Simulation (Leichtwasserreaktor) im Browser –
ohne Build-Schritt, als einzelne HTML-Seite mit separatem, testbarem Physik-Modul.

> ⚠️ **Lehrmodell, kein Auslegungswerkzeug.** Angezeigte Werte (MW, °C, GWh) sind
> illustrativ und nicht maßstäblich. Geometrie und Wirkungsquerschnitte des
> Teilchenmodells sind didaktisch vereinfacht. Für Sicherheitsanalysen oder
> quantitative Vorhersagen ist die Simulation **nicht** geeignet.

## Starten

Einfach `index.html` in einem modernen Browser öffnen (Doppelklick genügt –
kein Server, kein Build). `physics.js` muss im selben Verzeichnis liegen.

## Bedienung

- **Steuerstäbe / Moderator / Kühlmittel**: Primärregelung der Kettenreaktion und Wärmeabfuhr.
- **Neutronenquelle zünden**: injiziert Startneutronen.
- **SCRAM**: Schnellabschaltung (Stäbe ein, Moderator aus). Achtung: durch
  **Nachzerfallswärme** steigt die Temperatur danach kurz weiter.
- **Auto-Refuel** (Standard: AUS): beschleunigter Brennstoffersatz, rein für Demozwecke.
- **Einstellungen** (Zahnrad): physikalische Kernparameter feinjustieren.

## Modellannahmen (bewusst)

- **Zeitbasis**: Die Simulation ist bildratenunabhängig (echtes `dt`). Schnelle
  Dynamik (Neutronen, Leistung, Temperatur) läuft in Echtzeit; **langsame**
  nukleare Prozesse (I-135/Xe-135-Kinetik, Abbrand, Nachzerfallswärme) laufen
  zeitlich **~1500× beschleunigt**, damit Transienten in einer Sitzung sichtbar werden.
- **k-eff** wird aus der tatsächlichen Neutronenbilanz **gemessen**
  (`erzeugte / terminierte Neutronen`), nicht heuristisch aus den Reglern berechnet.
- **Iodine/Xenon** folgen einem ODE-Modell mit realen Zerfallskonstanten – inklusive
  „Jodloch" (Xenon-Peak nach Abschaltung).
- **Rückkopplung**: getrennte Brennstoff- (prompter Doppler) und
  Kühlmitteltemperatur (Moderatorkoeffizient), beide negativ.
- **Schaden** mehrstufig: Hüllrohrschaden (~1200 °C) → Kernschmelze (~2800 °C).
- Der **verzögerte Neutronenanteil** ist standardmäßig zur Sichtbarkeit überhöht
  (5 %; real β≈0,65 %) und im Einstellungs-Dialog bis zum realistischen Wert regelbar.

## Tests

Die reine Physik-Mathematik (`physics.js`) ist per Node-Unit-Tests abgedeckt:

```bash
npm test
```

## Dateien

| Datei                   | Inhalt                                                        |
|-------------------------|--------------------------------------------------------------|
| `index.html`            | UI, Canvas-Rendering, Neutronen-Monte-Carlo, Audio           |
| `physics.js`            | Reines Physik-Modell (Xenon, Zerfallswärme, Thermik, k-eff)  |
| `tests/physics.test.js` | Unit-Tests für `physics.js`                                  |
