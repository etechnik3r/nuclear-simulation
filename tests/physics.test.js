/*
 * Unit-Tests für das Kernphysik-Modell (physics.js).
 * Ausführen mit:  npm test   (bzw.  node tests/physics.test.js)
 * Keine externen Abhängigkeiten – nur Node's eingebautes assert.
 */
const assert = require('assert');
const RP = require('../physics.js');
const P = RP.PHYSICS_DEFAULTS;

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`      ${err.message}`);
        process.exitCode = 1;
    }
}
function approx(actual, expected, tol, msg) {
    assert.ok(Math.abs(actual - expected) <= tol,
        `${msg || ''} erwartet ~${expected} (±${tol}), war ${actual}`);
}

console.log('physics.js – Tests');

// --- keffFromCounts -----------------------------------------------------------
test('keffFromCounts: stationär (births==deaths) ergibt k=1', () => {
    approx(RP.keffFromCounts(100, 100), 1.0, 1e-9);
});
test('keffFromCounts: superkritisch > 1, subkritisch < 1', () => {
    assert.ok(RP.keffFromCounts(120, 100) > 1);
    assert.ok(RP.keffFromCounts(80, 100) < 1);
});
test('keffFromCounts: keine Terminationen -> 0 (kein NaN/Infinity)', () => {
    assert.strictEqual(RP.keffFromCounts(50, 0), 0);
});

// --- feedbackFactors ----------------------------------------------------------
test('feedbackFactors: bei Umgebungstemperatur keine Dämpfung (=1)', () => {
    const fb = RP.feedbackFactors({ fuelTemp: P.ambient, temperature: P.ambient }, P);
    approx(fb.doppler, 1.0, 1e-9);
    approx(fb.modTemp, 1.0, 1e-9);
});
test('feedbackFactors: höhere Temperatur => stärker negativ (Faktor < 1, monoton)', () => {
    const a = RP.feedbackFactors({ fuelTemp: 600, temperature: 400 }, P);
    const b = RP.feedbackFactors({ fuelTemp: 1200, temperature: 800 }, P);
    assert.ok(a.doppler < 1 && a.modTemp < 1);
    assert.ok(b.doppler < a.doppler, 'Doppler muss mit Temperatur weiter sinken');
    assert.ok(b.modTemp < a.modTemp, 'Moderatorterm muss mit Temperatur weiter sinken');
});

// --- xenonStep ----------------------------------------------------------------
test('xenonStep: ohne Leistung und ohne Iod bleibt Xenon 0', () => {
    const s = { iodine: 0, xenon: 0 };
    for (let i = 0; i < 100; i++) RP.xenonStep(s, 0, 50, P);
    approx(s.xenon, 0, 1e-12);
    approx(s.iodine, 0, 1e-12);
});
test('xenonStep: Gleichgewicht bei Volllast (p=1) liegt bei ~0.45 (normiert)', () => {
    const s = { iodine: 0, xenon: 0 };
    for (let i = 0; i < 6000; i++) RP.xenonStep(s, 1, 50, P); // ~300000 Reaktorsekunden
    approx(s.xenon, 0.45, 0.03, 'Xenon-Gleichgewicht');
    assert.ok(s.iodine > 0);
});
test('xenonStep: Werte werden nie negativ', () => {
    const s = { iodine: 0.5, xenon: 0.5 };
    for (let i = 0; i < 6000; i++) RP.xenonStep(s, 0, 50, P);
    assert.ok(s.xenon >= 0 && s.iodine >= 0);
});
test('xenonStep: Jodloch – nach Abschaltung steigt Xenon erst an (Peak > Gleichgewicht)', () => {
    const s = { iodine: 0, xenon: 0 };
    // Gleichgewicht bei Volllast
    for (let i = 0; i < 6000; i++) RP.xenonStep(s, 1, 50, P);
    const eq = s.xenon;
    // Abschaltung: p=0, Xenon baut sich aus dem Iod-Vorrat weiter auf
    let peak = s.xenon;
    for (let i = 0; i < 6000; i++) { RP.xenonStep(s, 0, 50, P); if (s.xenon > peak) peak = s.xenon; }
    assert.ok(peak > eq * 1.05, `Xenon-Peak (${peak.toFixed(3)}) muss über Gleichgewicht (${eq.toFixed(3)}) liegen`);
    assert.ok(s.xenon < peak, 'nach dem Peak muss Xenon wieder abklingen');
});

// --- decayHeatStep ------------------------------------------------------------
test('decayHeatStep: konvergiert gegen ~6,5% der Spaltleistung', () => {
    const s = { decayHeat: 0 };
    for (let i = 0; i < 200000; i++) RP.decayHeatStep(s, 1000, 50, P);
    approx(s.decayHeat, P.decayHeatFraction * 1000, 1.0);
});
test('decayHeatStep: nach Abschaltung klingt die Wärme ab (nicht sofort 0)', () => {
    const s = { decayHeat: 65 };
    RP.decayHeatStep(s, 0, 50, P);
    assert.ok(s.decayHeat > 0 && s.decayHeat < 65, 'Nachzerfallswärme klingt langsam ab');
});

// --- thermalStep --------------------------------------------------------------
test('thermalStep: ohne Leistung kühlt der Kern Richtung Umgebungstemperatur', () => {
    const s = { fuelTemp: 800, temperature: 600 };
    for (let i = 0; i < 200000; i++) RP.thermalStep(s, 0, 1.0, 0.05, P);
    approx(s.temperature, P.ambient, 2);
    approx(s.fuelTemp, P.ambient, 2);
});
test('thermalStep: stationäre Temperatur passt zur analytischen Lösung', () => {
    const s = { fuelTemp: 150, temperature: 150 };
    const Pth = 1000, cf = 1.0;
    for (let i = 0; i < 400000; i++) RP.thermalStep(s, Pth, cf, 0.05, P);
    const expectedCool = P.ambient + Pth * P.fuelHeatCoef / (cf * P.coolCoef);
    const expectedGap = Pth * P.fuelHeatCoef / P.fuelCoolCoef;
    approx(s.temperature, expectedCool, 3, 'Kühlmitteltemperatur');
    approx(s.fuelTemp, expectedCool + expectedGap, 4, 'Brennstofftemperatur');
});
test('thermalStep: Brennstoff nie kälter als Kühlmittel, nie unter Umgebung', () => {
    const s = { fuelTemp: 150, temperature: 150 };
    for (let i = 0; i < 1000; i++) RP.thermalStep(s, 500, 0.5, 0.05, P);
    assert.ok(s.fuelTemp >= s.temperature);
    assert.ok(s.temperature >= P.ambient);
});
test('thermalStep: geringerer Kühlmitteldurchsatz => höhere Temperatur', () => {
    const hot = { fuelTemp: 150, temperature: 150 };
    const cold = { fuelTemp: 150, temperature: 150 };
    for (let i = 0; i < 200000; i++) {
        RP.thermalStep(hot, 1000, 0.2, 0.05, P);
        RP.thermalStep(cold, 1000, 1.0, 0.05, P);
    }
    assert.ok(hot.fuelTemp > cold.fuelTemp, 'weniger Kühlung muss heißer sein');
});

console.log(`\n${passed} Tests bestanden.`);
