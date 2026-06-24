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

**Steuerung**
- **Steuerstäbe / Moderator / Kühlmittel**: Primärregelung der Kettenreaktion und Wärmeabfuhr.
- **Turbinen-Last / Netzbedarf**: Sekundärkreis. Mehr Turbinenlast entzieht Wärme →
  über die negative Temperaturrückkopplung folgt die Reaktorleistung nach (**Lastfolge**).
  Ziel: die erzeugte **elektrische Leistung (MWe)** an den **Netzbedarf** anpassen,
  sonst weicht die **Netzfrequenz** von 50 Hz ab.
- **Bor-Soll**: chemische Reaktivitätsregelung – langsam, aber präzise; ideal gegen Xenon.
- **Druck-Soll**: Primärdruck. Fällt er, sinkt die Siedetemperatur → **Void/Sieden** und
  **DNB-Krise** (Wärmeübergangskrise → eigener Schadensweg).
- **Neutronenquelle zünden**: injiziert Startneutronen.
- **SCRAM**: Schnellabschaltung (Stäbe ein, Moderator aus). Achtung: durch
  **Nachzerfallswärme** steigt die Temperatur danach kurz weiter.
- **Auto-Refuel** (Standard: AN): beschleunigter Brennstoffersatz, damit der Kern nicht in
  Sekunden abbrennt; rein für Demozwecke (abschaltbar).
- **Einstellungen** (Zahnrad): physikalische Kernparameter feinjustieren.

**Wichtige Metriken (mit Tooltips)**
- **k-eff**, **Reaktivität ($)** und **Reaktorperiode (s)** – $ ≥ 1 = prompt-kritisch (Gefahr).
- **MWe / Wirkungsgrad / Netzfrequenz**, **Druck / Siedereserve (DNB) / Void**,
  **Bor (ppm)**, **Xe-135 / Iod-135**.

**Spielmodi (Leiste oben)**
- **Sandbox**: freies Spiel; optional **Zufalls-Störfälle** einschalten.
- **Missionen**: Kaltstart, Lastfolge, Xenon-Transiente, Notfall – jeweils mit Ziel und
  Erfolgs-/Fehlbedingung.
- **Störfälle**: Pumpenausfall, Turbinen-Trip, klemmender Steuerstab, Leck im Primärkreis –
  lösen Alarm + Hinweis aus; richtig reagieren!

**Lernsystem (unten rechts)**: kontextabhängige Warnungen (Vorrang) + rotierende
Lehr-/Spieltipps – so lernt man die Mechanik nach und nach.

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
