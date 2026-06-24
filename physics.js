/*
 * physics.js — Kernphysik-Modell der Reaktor-Simulation
 * ----------------------------------------------------------------------------
 * Reine, seiteneffektarme Funktionen für die "langsame" Reaktorphysik
 * (Iodine/Xenon-Kinetik, Nachzerfallswärme, Zwei-Knoten-Thermohydraulik,
 * Reaktivitäts-Rückkopplung, gemessenes k-eff).
 *
 * Bewusst NICHT enthalten: die teilchenbasierte Neutronen-Monte-Carlo-Logik
 * (sie lebt in index.html, weil sie eng mit dem Canvas-Rendering verzahnt ist).
 *
 * WICHTIG — Modellcharakter:
 * Dies ist ein QUALITATIVES Lehrmodell. Geometrie/Querschnitte des
 * Teilchenmodells sind illustrativ und NICHT maßstäblich. Die hier
 * verwendeten Zeitkonstanten für I-135/Xe-135 sind dagegen physikalisch
 * korrekt skaliert; damit die Xenon-Transienten in einer Sitzung sichtbar
 * werden, läuft die "Reaktorzeit" für langsame Prozesse beschleunigt
 * (PHYSICS_DEFAULTS.timeAccel).
 *
 * Das Modul ist UMD-artig: im Browser landet es unter window.ReactorPhysics,
 * unter Node.js unter module.exports (für die Tests in tests/).
 */
(function (root, factory) {
    const mod = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = mod;
    }
    root.ReactorPhysics = mod;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const AMBIENT = 150; // °C, Eintritts-/Leerlauftemperatur des Kühlmittels

    // Zerfallskonstanten (1/s) aus realen Halbwertszeiten
    const LAMBDA_I = Math.LN2 / (6.6 * 3600);  // I-135, T½ ≈ 6,6 h
    const LAMBDA_XE = Math.LN2 / (9.1 * 3600); // Xe-135, T½ ≈ 9,1 h

    const PHYSICS_DEFAULTS = {
        // --- Neutronik (Tuning des Teilchenmodells, kalibriert auf 60-fps-Basis) ---
        fissionEnergy: 680,           // Energie-Einheiten pro Spaltung (arbiträr)
        backgroundSource: 0.15,       // Quellterm-Wahrscheinlichkeit / 60-fps-Frame
        minNeutronsStarthilfe: 15,    // unter dieser Zahl: erhöhter Quellterm
        wallReflectivity: 0.95,       // Reflektor-Wirkungsgrad an der Kerngrenze
        promptChance2: 0.85,          // P(2. promptes Neutron)
        promptChance3: 0.45,          // P(3. promptes Neutron)  -> ν_prompt ≈ 2,30
        delayedChance: 0.05,          // verzögerter Anteil (ÜBERHÖHT für Sichtbarkeit; real β≈0,0065)
        delayedDelayMin: 500,         // ms, untere Verzögerung
        delayedDelayMax: 1800,        // ms, obere Verzögerung
        fissionChanceThermal: 0.92,   // Spaltwahrscheinlichkeit thermisch (illustrativ)
        fissionChanceFast: 0.15,      // Spaltwahrscheinlichkeit schnell (illustrativ)
        moderatorRate: 0.14,          // Thermalisierungsrate / 60-fps-Frame
        parasiticThermal: 0.015,      // parasitäre Absorption thermisch / Frame
        parasiticFast: 0.002,         // parasitäre Absorption schnell / Frame
        xenonVisualAbsorb: 0.22,      // Neutronen-Absorption durch Xe pro Xenon-Einheit / Frame
        maxNeutrons: 2000,            // Performance-Obergrenze (kein Physik-Term)
        basePowerScale: 0.08,         // Umrechnung Spaltenergie-Eintrag -> thermische Leistung (MW)
        rodWorth: 0.06,               // globale Steuerstab-Wirkung (Absorption pro Einfahrtiefe / Frame) – zuverlässige Regelung

        // --- Reaktivitäts-Rückkopplung (negativ) ---
        dopplerCoeff: 650,            // Brennstoff-/Doppler-Rückkopplung (kleiner = stärker, prompt)
        modTempCoeff: 1200,           // Moderator-/Kühlmittel-Temperaturkoeffizient (kleiner = stärker)

        // --- Iodine/Xenon-Kinetik (physikalische Zeitkonstanten) ---
        lambdaI: LAMBDA_I,
        lambdaXe: LAMBDA_XE,
        xeBurnFull: 3 * LAMBDA_XE,    // Xe-Abbrand durch Neutronenfluss bei p=1 (~3× radioaktiver Zerfall)
        iodineYield: 3.63e-5,         // I-135-Produktion pro norm. Leistung (Einheiten so gewählt, dass Xe_eq≈0,45)
        xenonYieldDirect: 1.9e-6,     // direkte Xe-135-Produktion pro norm. Leistung
        nominalPower: 1200,           // MW, Bezugsleistung für die Normierung p = P/nominal
        pClamp: 1.5,                  // Begrenzung der normierten Leistung in der Kinetik

        // --- Nachzerfallswärme ---
        decayHeatFraction: 0.065,     // ~6,5 % der Spaltleistung gehen in Zerfallswärme-Vorläufer
        tauDecayHeat: 10800,          // Reaktorsekunden, e-fache Abklingzeit der Zerfallswärme

        // --- Thermohydraulik (Zwei-Knoten: Brennstoff + Kühlmittel) ---
        ambient: AMBIENT,
        coolantMin: 0.05,             // minimaler effektiver Kühlmitteldurchsatz
        fuelHeatCoef: 0.7,            // Kopplung Leistung -> Brennstofftemperatur (heißer Brennstoff -> wirksamer Doppler)
        fuelCoolCoef: 1.2,            // Wärmeübergang Brennstoff -> Kühlmittel
        coolCoef: 6.5,                // Wärmeabfuhr Kühlmittel -> Sekundärkreis (hoch -> Kühlmittel bleibt unter Sättigung)
        fuelCap: 4.0,                 // Wärmekapazität Brennstoffknoten (größer = träger)
        coolCap: 8.0,                 // Wärmekapazität Kühlmittelknoten

        // --- Schadens-/Schmelzschwellen (auf Brennstofftemperatur) ---
        claddingTemp: 1200,           // °C, Hüllrohrversagen (Zircaloy)
        meltdownTemp: 2800,           // °C, Brennstoffschmelze (UO₂ ~2865 °C)

        // --- Leistungsglättung & Zeitbasis ---
        tauPower: 2.5,                // s, Reaktionszeit der Spaltleistung (Echtzeit)
        timeAccel: 300,             // Beschleunigung der "Reaktorzeit" für langsame Prozesse

        // --- Turbine / Sekundärkreis / Netz ---
        turbineEfficiency: 0.33,      // thermischer Wirkungsgrad (Wärme -> Strom)
        turbineMinSink: 0.7,          // Rest-Wärmeabfuhr bei Last 0 (Kondensator/Bypass; Primärkühlung hängt v.a. an den Pumpen)
        gridStiffness: 12,            // Hz pro relativer Leistungsabweichung (Netzsteifigkeit)
        gridNominalFreq: 50,          // Hz

        // --- Bor (chemische Reaktivitätsregelung) ---
        boronMax: 2000,               // ppm, Maximalkonzentration
        boronRate: 8,                 // ppm/s, Annäherung Ist an Soll (langsam = "chemical shim")
        boronAbsorbCoef: 5e-5,        // Absorptionswahrscheinlichkeit pro ppm / 60-fps-Frame (Teilchenmodell)
        boronPcmPerPpm: 8,            // Reaktivitätswert für die Anzeige (pcm pro ppm)

        // --- Druck / Sieden / Void ---
        pressureMin: 30,              // bar
        pressureMax: 160,             // bar
        pressureNominal: 155,         // bar (PWR-typisch)
        pressureRate: 6,              // bar/s, Annäherung Ist an Soll (Druckhalter)
        voidBand: 25,                 // °C unterhalb der Sättigung beginnt nennenswerter Void
        voidReactivityCoef: 0.6,      // wie stark Void die Moderation senkt (0..1 -> bis -60%)
        voidCoolingPenalty: 0.4,      // wie stark Void die Wärmeabfuhr verschlechtert (kein Lock-up)
        dnbWarn: 30,                  // °C Siedereserve, ab der gewarnt wird

        // --- Reaktivität / Periode (Anzeige) ---
        periodCap: 999                // s, Anzeige-Obergrenze (alles darüber = "stabil/∞")
    };

    /**
     * Negative Reaktivitäts-Rückkopplungen.
     * doppler: prompt, abhängig von der BRENNSTOFFtemperatur (Resonanzabsorption U-238).
     * modTemp: abhängig von der KÜHLMITTEL-/Moderatortemperatur (Dichte/Spektrum).
     */
    function feedbackFactors(state, P) {
        const dFuel = Math.max(0, state.fuelTemp - P.ambient);
        const dCool = Math.max(0, state.temperature - P.ambient);
        return {
            doppler: 1 / (1 + dFuel / P.dopplerCoeff),
            modTemp: 1 / (1 + dCool / P.modTempCoeff)
        };
    }

    /**
     * Iodine-135 / Xenon-135-Kinetik (explizites Euler-Verfahren).
     * p: normierte Leistung (= P/nominalPower), dt: Reaktorsekunden.
     * Mutiert state.iodine und state.xenon.
     */
    function xenonStep(state, p, dt, P) {
        p = Math.max(0, Math.min(P.pClamp, p));
        const dI = (P.iodineYield * p - P.lambdaI * state.iodine) * dt;
        state.iodine = Math.max(0, state.iodine + dI);

        const burn = P.xeBurnFull * p; // Xe-Abbrand ∝ Neutronenfluss
        const dXe = (P.lambdaI * state.iodine + P.xenonYieldDirect * p
                     - (P.lambdaXe + burn) * state.xenon) * dt;
        state.xenon = Math.max(0, state.xenon + dXe);
        return state.xenon;
    }

    /**
     * Nachzerfallswärme: relaxiert gegen einen Bruchteil der aktuellen
     * Spaltleistung. Nach Abschaltung (fissionPower -> 0) klingt sie mit
     * tauDecayHeat langsam ab und treibt weiterhin die Temperatur.
     * dt: Reaktorsekunden. Mutiert state.decayHeat.
     */
    function decayHeatStep(state, fissionPower, dt, P) {
        const target = P.decayHeatFraction * Math.max(0, fissionPower);
        state.decayHeat += (target - state.decayHeat) * (1 - Math.exp(-dt / P.tauDecayHeat));
        if (state.decayHeat < 0) state.decayHeat = 0;
        return state.decayHeat;
    }

    /**
     * Zwei-Knoten-Thermohydraulik (Brennstoff + Kühlmittel), Echtzeit (s).
     * totalThermalPower = Spaltleistung + Nachzerfallswärme.
     * turbineLoad (0..1): Dampfentnahme der Turbine = Wärmesenke des Sekundärkreises.
     *   Bei Last 0 (Turbinen-Trip) bleibt nur die Rest-Senke turbineMinSink -> Kern heizt auf.
     * Mutiert state.fuelTemp und state.temperature.
     * Gibt zusätzlich die abgeführte Wärme zurück (-> daraus folgt die elektrische Leistung).
     */
    function thermalStep(state, totalThermalPower, coolantFlow, turbineLoad, dt, P) {
        const cf = Math.max(P.coolantMin, coolantFlow);
        const sink = P.turbineMinSink + (1 - P.turbineMinSink) * Math.max(0, Math.min(1, turbineLoad));
        const gap = state.fuelTemp - state.temperature;

        const heatRemoved = (state.temperature - P.ambient) * cf * P.coolCoef * sink;

        state.fuelTemp += ((totalThermalPower * P.fuelHeatCoef - gap * P.fuelCoolCoef) / P.fuelCap) * dt;
        state.temperature += ((gap * P.fuelCoolCoef - heatRemoved) / P.coolCap) * dt;

        if (state.temperature < P.ambient) state.temperature = P.ambient;
        if (state.fuelTemp < state.temperature) state.fuelTemp = state.temperature; // Brennstoff nie kälter als Kühlmittel
        return { fuelTemp: state.fuelTemp, temperature: state.temperature, heatRemoved: Math.max(0, heatRemoved) };
    }

    /**
     * Gemessenes k-eff aus der Neutronenbilanz eines Zeitfensters:
     * k = (durch Spaltung erzeugte Neutronen) / (alle terminierten Neutronen).
     * Im stationären Zustand gilt births == deaths -> k = 1.
     * deaths zählt Spaltung + Absorption + Leckage (NICHT das Performance-Culling).
     */
    function keffFromCounts(births, deaths) {
        if (deaths <= 0) return 0;
        return births / deaths;
    }

    /**
     * Reaktivität aus k-eff. rho = (k-1)/k. In "Dollar" relativ zum verzögerten
     * Neutronenanteil beta: $ = rho/beta. $ >= 1 bedeutet prompt-kritisch (gefährlich).
     */
    function reactivity(keff, beta) {
        if (keff <= 0) return { rho: -1, pcm: -100000, dollars: -1 / Math.max(1e-9, beta) };
        const rho = (keff - 1) / keff;
        return { rho, pcm: rho * 1e5, dollars: rho / Math.max(1e-9, beta) };
    }

    /**
     * Reaktorperiode (s) = Zeit für eine Änderung der Leistung um den Faktor e.
     * growthPerSec = d(ln N)/dt. Sehr kleine Raten -> sehr lange Periode (gecappt).
     */
    function reactorPeriod(growthPerSec, P) {
        const cap = (P && P.periodCap) || 999;
        if (!isFinite(growthPerSec) || Math.abs(growthPerSec) < 1 / cap) return Infinity;
        return 1 / growthPerSec;
    }

    /**
     * Sättigungstemperatur von Wasser (°C) als Funktion des Drucks (bar).
     * Einfache, monoton steigende Näherung (1 bar -> 100 °C, 155 bar -> ~345 °C).
     */
    function saturationTemp(pressureBar) {
        const p = Math.max(1, pressureBar);
        return 100 + 112 * Math.log10(p);
    }

    /**
     * Void-/Dampfblasenanteil (0..1): steigt, wenn die Kühlmitteltemperatur
     * innerhalb von voidBand an die Sättigungstemperatur heranreicht.
     */
    function voidFraction(coolTemp, satTemp, P) {
        const band = (P && P.voidBand) || 25;
        return Math.max(0, Math.min(1, (coolTemp - (satTemp - band)) / band));
    }

    /**
     * Siedereserve / DNB-Marge (°C): Abstand der Kühlmitteltemperatur zur Sättigung.
     * Positiv = sicher, <= 0 = Sieden / Wärmeübergangskrise.
     */
    function dnbMargin(coolTemp, satTemp) {
        return satTemp - coolTemp;
    }

    /**
     * Reaktivitätswert der Bor-Konzentration (pcm, negativ) – nur für die Anzeige.
     * Die tatsächliche Wirkung steckt im Teilchenmodell (Absorption ∝ ppm).
     */
    function boronWorthPcm(ppm, P) {
        return -ppm * ((P && P.boronPcmPerPpm) || 8);
    }

    /**
     * Netzfrequenz (Hz) aus Erzeugung/Bedarf. Überschuss -> Frequenz steigt,
     * Defizit -> Frequenz fällt. Annäherung an die Realität (Netzsteifigkeit).
     */
    function gridFrequency(supplyMWe, demandMWe, P) {
        const f0 = (P && P.gridNominalFreq) || 50;
        const stiff = (P && P.gridStiffness) || 12;
        if (demandMWe <= 0) return f0;
        const dev = (supplyMWe - demandMWe) / demandMWe;
        return f0 + stiff * dev;
    }

    return {
        AMBIENT,
        PHYSICS_DEFAULTS,
        feedbackFactors,
        xenonStep,
        decayHeatStep,
        thermalStep,
        keffFromCounts,
        reactivity,
        reactorPeriod,
        saturationTemp,
        voidFraction,
        dnbMargin,
        boronWorthPcm,
        gridFrequency
    };
});
