// Diffie–Hellman simulator (minimal, vanilla JS)
// Educational only. Uses BigInt and a small Miller-Rabin for primality checks (64-bit safe).

(() => {
  'use strict';

  // Elements
  const el = (id) => document.getElementById(id);
  const pInput = el('p');
  const gInput = el('g');
  const aInput = el('a');
  const bInput = el('b');
  const btnValidate = el('btnValidate');
  const btnRandom = el('btnRandom');
  const btnRandomAll = el('btnRandomAll');
  const btnStep = el('btnStep');
  const btnAuto = el('btnAuto');
  const btnReset = el('btnReset');
  const msgBox = el('messages');
  const ABox = el('A');
  const BBox = el('B');
  const S1Box = el('S1');
  const S2Box = el('S2');
  const stepsBox = el('steps');
  const stepIndicator = el('stepIndicator');

  // State
  const TOTAL_STEPS = 9;
  let stepIdx = 0; // 0..9 (0 = sebelum mulai)
  let timer = null; // autoplay

  let p = 23n, g = 5n, a = 6n, b = 15n;
  let A = null, B = null, sAlice = null, sBob = null;

  // Utils: parsing BigInt decimal
  function parseBigIntDec(str) {
    const s = String(str || '').trim();
    if (!/^[0-9]+$/.test(s)) return { ok: false, error: 'Masukkan hanya angka desimal.' };
    try {
      const v = BigInt(s);
      return { ok: true, value: v };
    } catch (e) {
      return { ok: false, error: 'Angka terlalu besar/tidak valid.' };
    }
  }

  // BigInt mod pow: fast exponentiation
  function modPow(base, exp, mod) {
    if (mod === 1n) return 0n;
    let result = 1n;
    let b = ((base % mod) + mod) % mod;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) result = (result * b) % mod;
      e >>= 1n;
      b = (b * b) % mod;
    }
    return result;
  }

  // Miller–Rabin primality (deterministic for 64-bit using known bases)
  function isProbablePrime(n) {
    if (n < 2n) return false;
    const smallPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    for (const p of smallPrimes) {
      if (n === p) return true;
      if (n % p === 0n) return n === p;
    }
    // write n-1 = d * 2^s
    let d = n - 1n;
    let s = 0n;
    while ((d & 1n) === 0n) { d >>= 1n; s++; }

    function check(a) {
      if (a % n === 0n) return true;
      let x = modPow(a, d, n);
      if (x === 1n || x === n - 1n) return true;
      for (let r = 1n; r < s; r++) {
        x = (x * x) % n;
        if (x === n - 1n) return true;
      }
      return false;
    }

    // Deterministic bases for 64-bit integers
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n];
    for (const a of bases) {
      if (!check(a)) return false;
    }
    return true; // probably prime (deterministic for 64-bit)
  }

  // crypto-safe random BigInt in [0, maxExclusive)
  function randomBigIntBelow(maxExclusive) {
    if (maxExclusive <= 0n) return 0n;
    const bitLen = maxExclusive.toString(2).length;
    const byteLen = Math.ceil(bitLen / 8);
    const bytes = new Uint8Array(byteLen);
    const mask = (1n << BigInt(bitLen)) - 1n;
    while (true) {
      crypto.getRandomValues(bytes);
      let val = 0n;
      for (let i = 0; i < byteLen; i++) val = (val << 8n) + BigInt(bytes[i]);
      val = val & mask;
      if (val < maxExclusive) return val;
    }
  }

  // Random BigInt in [min .. max]
  function randomBigIntInRange(min, max) {
    if (max < min) [min, max] = [max, min];
    const span = (max - min) + 1n;
    const off = randomBigIntBelow(span);
    return min + off;
  }

  // Generate a random prime in [minP .. maxP] (BigInt). Uses Miller-Rabin.
  function randomPrimeInRange(minP, maxP) {
    if (maxP < 5n) maxP = 5n;
    if (minP < 5n) minP = 5n;
    if ((minP & 1n) === 0n) minP += 1n; // make odd
    if ((maxP & 1n) === 0n) maxP -= 1n; // make odd
    if (minP > maxP) [minP, maxP] = [maxP, minP];

    let candidate = randomBigIntInRange(minP, maxP);
    if ((candidate & 1n) === 0n) candidate += 1n;

    // Try random starting point, then scan upward by 2, then wrap.
    const limit = Number((maxP - minP) / 2n) + 2; // number of odd numbers in range
    let tries = 0;
    while (tries < limit) {
      if (isProbablePrime(candidate)) return candidate;
      candidate += 2n;
      if (candidate > maxP) candidate = minP;
      tries++;
    }
    // Fallback deterministic scan
    for (let n = minP; n <= maxP; n += 2n) {
      if (isProbablePrime(n)) return n;
    }
    // As a last resort, return a known small prime
    return 101n;
  }

  // Distinct prime factors of n (BigInt), naive trial division. Suitable for small n.
  function primeFactorsDistinct(n) {
    const out = [];
    let x = n;
    while (x % 2n === 0n) { if (!out.includes(2n)) out.push(2n); x /= 2n; }
    let f = 3n;
    while (f * f <= x) {
      if (x % f === 0n) { if (!out.includes(f)) out.push(f); x /= f; }
      else f += 2n;
    }
    if (x > 1n) { if (!out.includes(x)) out.push(x); }
    return out;
  }

  // Try to find a generator of Z_p^* using factorization of p-1
  function findGenerator(p) {
    const phi = p - 1n;
    const factors = primeFactorsDistinct(phi);
    for (let attempt = 0; attempt < 64; attempt++) {
      const gCand = randomBigIntInRange(2n, p - 2n);
      let ok = true;
      for (const q of factors) {
        if (modPow(gCand, phi / q, p) === 1n) { ok = false; break; }
      }
      if (ok) return gCand;
    }
    // Fallback linear search
    for (let gCand = 2n; gCand <= p - 2n; gCand++) {
      let ok = true;
      for (const q of factors) {
        if (modPow(gCand, phi / q, p) === 1n) { ok = false; break; }
      }
      if (ok) return gCand;
    }
    return 2n; // last resort
  }

  // Input helpers
  function readInputs() {
    const pV = parseBigIntDec(pInput.value);
    if (!pV.ok) return { ok: false, error: `p: ${pV.error}` };
    const gV = parseBigIntDec(gInput.value);
    if (!gV.ok) return { ok: false, error: `g: ${gV.error}` };
    const aV = parseBigIntDec(aInput.value);
    if (!aV.ok) return { ok: false, error: `a: ${aV.error}` };
    const bV = parseBigIntDec(bInput.value);
    if (!bV.ok) return { ok: false, error: `b: ${bV.error}` };
    return { ok: true, p: pV.value, g: gV.value, a: aV.value, b: bV.value };
  }

  function validateParams(showMsgs = true) {
    const R = readInputs();
    if (!R.ok) { if (showMsgs) setMessage(R.error); return false; }
    const P = R.p, G = R.g, Asec = R.a, Bsec = R.b;

    if (P < 3n) { if (showMsgs) setMessage('p harus >= 3.'); return false; }
    if (!isProbablePrime(P)) { if (showMsgs) setMessage('p tampaknya bukan prima.'); return false; }
    if (G <= 1n || G >= P) { if (showMsgs) setMessage('g harus dalam rentang 2 .. p-1.'); return false; }
    if (Asec < 2n || Asec >= P - 1n) { if (showMsgs) setMessage('a harus dalam rentang 2 .. p-2.'); return false; }
    if (Bsec < 2n || Bsec >= P - 1n) { if (showMsgs) setMessage('b harus dalam rentang 2 .. p-2.'); return false; }

    // If all good, update state (do not compute yet)
    p = P; g = G; a = Asec; b = Bsec;
    if (showMsgs) setMessage('Parameter valid.');
    return true;
  }

  function setMessage(msg) {
    msgBox.textContent = msg || '';
  }

  function clearComputed() {
    A = B = sAlice = sBob = null;
    ABox.textContent = '?';
    BBox.textContent = '?';
    S1Box.textContent = '?';
    S2Box.textContent = '?';
  }

  function updateComputedBoxes() {
    if (A !== null) ABox.textContent = A.toString();
    if (B !== null) BBox.textContent = B.toString();
    if (sAlice !== null) S1Box.textContent = sAlice.toString();
    if (sBob !== null) S2Box.textContent = sBob.toString();
  }

  function setStepIndicator() {
    stepIndicator.textContent = `Langkah ${stepIdx}/${TOTAL_STEPS}`;
  }

  function renderSteps() {
    const lines = [];
    const pS = p.toString(), gS = g.toString(), aS = a.toString(), bS = b.toString();

    if (stepIdx >= 1) lines.push(`1) Pilih parameter publik: p = ${pS}, g = ${gS}.`);
    if (stepIdx >= 2) lines.push(`2) Alice memilih rahasia a = ${aS}.`);
    if (stepIdx >= 3) {
      const AA = A !== null ? A.toString() : '...';
      lines.push(`3) Alice menghitung A = g^a mod p = ${gS}^${aS} mod ${pS} = ${AA}.`);
    }
    if (stepIdx >= 4) lines.push(`4) Bob memilih rahasia b = ${bS}.`);
    if (stepIdx >= 5) {
      const BB = B !== null ? B.toString() : '...';
      lines.push(`5) Bob menghitung B = g^b mod p = ${gS}^${bS} mod ${pS} = ${BB}.`);
    }
    if (stepIdx >= 6) lines.push('6) Alice <-> Bob saling bertukar nilai publik A dan B.');
    if (stepIdx >= 7) {
      const S1 = sAlice !== null ? sAlice.toString() : '...';
      lines.push(`7) Alice menghitung kunci S = B^a mod p = ${B !== null ? B.toString() : 'B'}^${aS} mod ${pS} = ${S1}.`);
    }
    if (stepIdx >= 8) {
      const S2 = sBob !== null ? sBob.toString() : '...';
      lines.push(`8) Bob menghitung kunci S = A^b mod p = ${A !== null ? A.toString() : 'A'}^${bS} mod ${pS} = ${S2}.`);
    }
    if (stepIdx >= 9) {
      const ok = sAlice !== null && sBob !== null && sAlice === sBob;
      lines.push(`9) Verifikasi: S(Alice) ${sAlice} ${ok ? '==' : '!='} S(Bob) ${sBob} ${ok ? '✅ cocok.' : '❌ tidak cocok.'}`);
    }

    stepsBox.textContent = lines.join('\n');
    setStepIndicator();
  }

  function nextStep() {
    if (!validateParams(false)) { setMessage('Perbaiki parameter terlebih dahulu.'); return; }
    if (stepIdx >= TOTAL_STEPS) return;

    stepIdx++;
    switch (stepIdx) {
      case 1: // pilih p,g (sudah ada)
        break;
      case 2: // pilih a
        break;
      case 3: // hitung A
        A = modPow(g, a, p);
        break;
      case 4: // pilih b
        break;
      case 5: // hitung B
        B = modPow(g, b, p);
        break;
      case 6: // tukar A,B
        break;
      case 7: // Alice hitung S
        if (B === null) B = modPow(g, b, p);
        sAlice = modPow(B, a, p);
        break;
      case 8: // Bob hitung S
        if (A === null) A = modPow(g, a, p);
        sBob = modPow(A, b, p);
        break;
      case 9: // verifikasi
        break;
    }
    updateComputedBoxes();
    renderSteps();
  }

  function resetAll() {
    stopAuto();
    // read current inputs, but do not change them unless invalid
    const R = readInputs();
    if (R.ok) { p = R.p; g = R.g; a = R.a; b = R.b; }
    stepIdx = 0;
    clearComputed();
    setMessage('');
    renderSteps();
  }

  function startAuto() {
    if (timer) return; // already running
    btnAuto.textContent = 'Hentikan Auto';
    btnStep.disabled = true;
    btnRandom.disabled = true;
    btnValidate.disabled = true;
    timer = setInterval(() => {
      if (stepIdx >= TOTAL_STEPS) { stopAuto(); return; }
      nextStep();
    }, 900);
  }

  function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
    btnAuto.textContent = 'Auto Play';
    btnStep.disabled = false;
    btnRandom.disabled = false;
    btnValidate.disabled = false;
  }

  function toggleAuto() { timer ? stopAuto() : startAuto(); }

  function randomizeSecrets() {
    if (!validateParams(false)) { setMessage('p dan g harus valid untuk mengacak a,b.'); return; }
    // a,b in [2 .. p-2]
    const range = (p - 3n) + 1n; // count of values from 2..p-2
    if (range <= 0n) { setMessage('Rentang a,b tidak valid.'); return; }
    const r1 = randomBigIntBelow(range) + 2n;
    const r2 = randomBigIntBelow(range) + 2n;
    a = r1; b = r2;
    aInput.value = a.toString();
    bInput.value = b.toString();
    setMessage('a dan b diacak.');
    clearComputed();
    renderSteps();
  }

  function randomizeAll() {
    stopAuto();
    // Choose a reasonable range for demo primes
    const minP = 401n, maxP = 2000n;
    const newP = randomPrimeInRange(minP, maxP);
    const newG = findGenerator(newP);
    const range = (newP - 3n) + 1n; // 2..p-2 inclusive
    const newA = (range > 0n ? randomBigIntBelow(range) + 2n : 2n);
    const newB = (range > 0n ? randomBigIntBelow(range) + 2n : 3n);

    // Update inputs
    pInput.value = newP.toString();
    gInput.value = newG.toString();
    aInput.value = newA.toString();
    bInput.value = newB.toString();

    // Update state and UI
    p = newP; g = newG; a = newA; b = newB;
    stepIdx = 0;
    clearComputed();
    setMessage('Parameter p, g, a, b diacak.');
    renderSteps();
  }

  // Event wiring
  btnValidate.addEventListener('click', () => {
    if (validateParams(true)) { clearComputed(); renderSteps(); }
  });
  btnRandom.addEventListener('click', randomizeSecrets);
  btnRandomAll.addEventListener('click', randomizeAll);
  btnStep.addEventListener('click', nextStep);
  btnAuto.addEventListener('click', toggleAuto);
  btnReset.addEventListener('click', resetAll);

  // If user edits inputs, stop autoplay and clear computed
  for (const inp of [pInput, gInput, aInput, bInput]) {
    inp.addEventListener('input', () => { stopAuto(); clearComputed(); stepIdx = 0; setStepIndicator(); stepsBox.textContent = ''; setMessage(''); });
  }

  // Init from defaults
  validateParams(false);
  clearComputed();
  renderSteps();
})();
