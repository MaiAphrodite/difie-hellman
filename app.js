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
  const btnPrev = el('btnPrev');
  const btnAuto = el('btnAuto');
  const btnReset = el('btnReset');
  const btnVerbose = el('btnVerbose');
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
  let verbose = false; // mode penjelasan rinci

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

  function flash(elm) {
    if (!elm) return;
    elm.classList.remove('flash');
    // force reflow to restart animation
    void elm.offsetWidth;
    elm.classList.add('flash');
    setTimeout(() => elm.classList.remove('flash'), 900);
  }

  function updateComputedBoxes() {
    // Mask values according to current step index to match narrative
    if (stepIdx >= 3 && A !== null) { ABox.textContent = A.toString(); } else { ABox.textContent = '?'; }
    if (stepIdx >= 5 && B !== null) { BBox.textContent = B.toString(); } else { BBox.textContent = '?'; }
    if (stepIdx >= 7 && sAlice !== null) { S1Box.textContent = sAlice.toString(); } else { S1Box.textContent = '?'; }
    if (stepIdx >= 8 && sBob !== null) { S2Box.textContent = sBob.toString(); } else { S2Box.textContent = '?'; }
  }

  function setStepIndicator() {
    stepIndicator.textContent = `Langkah ${stepIdx}/${TOTAL_STEPS}`;
  }

  function renderSteps() {
    const pS = p.toString(), gS = g.toString(), aS = a.toString(), bS = b.toString();

    const steps = [
      {
        n: 1,
        title: 'Pilih parameter publik',
        short: `Pilih p dan g yang diketahui publik.`,
        long: `Kita gunakan bilangan prima p = ${pS} dan generator g = ${gS}. Keduanya boleh dilihat semua orang.`,
        calc: `<code>p = ${pS}</code>, <code>g = ${gS}</code>`
      },
      {
        n: 2,
        title: 'Alice memilih rahasia a',
        short: `Alice memilih angka rahasia a.`,
        long: `Alice mengacak rahasia a = ${aS} (2 ≤ a ≤ p−2). Nilai ini tidak dibagikan.`,
        calc: `<code>a = ${aS}</code>`
      },
      {
        n: 3,
        title: 'Alice menghitung A',
        short: `Hitung A = g^a mod p.`,
        long: `Alice menghitung <code>A = g^a mod p</code> lalu membagikannya ke Bob.`,
        calc: `<code>A = ${gS}<sup>${aS}</sup> mod ${pS} = <span class="value" id="stepA">${A !== null ? A.toString() : '...'}</span></code>`
      },
      {
        n: 4,
        title: 'Bob memilih rahasia b',
        short: `Bob memilih angka rahasia b.`,
        long: `Bob mengacak rahasia b = ${bS} (2 ≤ b ≤ p−2). Nilai ini tidak dibagikan.`,
        calc: `<code>b = ${bS}</code>`
      },
      {
        n: 5,
        title: 'Bob menghitung B',
        short: `Hitung B = g^b mod p.`,
        long: `Bob menghitung <code>B = g^b mod p</code> lalu membagikannya ke Alice.`,
        calc: `<code>B = ${gS}<sup>${bS}</sup> mod ${pS} = <span class="value" id="stepB">${B !== null ? B.toString() : '...'}</span></code>`
      },
      {
        n: 6,
        title: 'Tukar nilai publik',
        short: `Alice ⇄ Bob saling bertukar A dan B.`,
        long: `Hanya nilai publik A dan B yang ditukar, rahasia a dan b tetap disimpan masing-masing.`,
        calc: `<code>A ↔ B</code>`
      },
      {
        n: 7,
        title: 'Alice menghitung kunci S',
        short: `S = B^a mod p.`,
        long: `Dengan B yang diterima, Alice menghitung <code>S = B^a mod p</code>.`,
        calc: `<code>S = ${B !== null ? B.toString() : 'B'}<sup>${aS}</sup> mod ${pS} = <span class="value" id="stepS1">${sAlice !== null ? sAlice.toString() : '...'}</span></code>`
      },
      {
        n: 8,
        title: 'Bob menghitung kunci S',
        short: `S = A^b mod p.`,
        long: `Dengan A yang diterima, Bob menghitung <code>S = A^b mod p</code>.`,
        calc: `<code>S = ${A !== null ? A.toString() : 'A'}<sup>${bS}</sup> mod ${pS} = <span class="value" id="stepS2">${sBob !== null ? sBob.toString() : '...'}</span></code>`
      },
      {
        n: 9,
        title: 'Verifikasi kunci bersama',
        short: `Bandingkan S milik Alice dan Bob.`,
        long: `Nilai kunci harus sama. Jika sama, pertukaran kunci berhasil.`,
        calc: (() => {
          const ok = sAlice !== null && sBob !== null && sAlice === sBob;
          const sa = sAlice !== null ? sAlice.toString() : '...?';
          const sb = sBob !== null ? sBob.toString() : '...?';
          const res = ok ? '✅ cocok' : '❌ tidak cocok';
          return `<code>S(Alice) = ${sa}</code> dan <code>S(Bob) = ${sb}</code> → <span class="value">${res}</span>`;
        })()
      }
    ];

    const html = [
      '<div class="steps">',
      ...steps.slice(0, stepIdx).map((st, idx) => {
        const stateClass = (idx+1 === stepIdx) ? 'step step--active' : 'step step--done';
        const title = st.title;
        const desc = verbose ? st.long : st.short;
        return `
          <div class="${stateClass}">
            <div class="step-num">${st.n}</div>
            <div class="step-content">
              <div class="step-title">${title}</div>
              <div class="step-body">${desc}</div>
              <div class="calc" style="margin-top:6px">${st.calc}</div>
            </div>
          </div>`;
      }),
      '</div>'
    ].join('');

    stepsBox.innerHTML = html;
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
        flash(ABox);
        break;
      case 4: // pilih b
        break;
      case 5: // hitung B
        B = modPow(g, b, p);
        flash(BBox);
        break;
      case 6: // tukar A,B
        break;
      case 7: // Alice hitung S
        if (B === null) B = modPow(g, b, p);
        sAlice = modPow(B, a, p);
        flash(S1Box);
        break;
      case 8: // Bob hitung S
        if (A === null) A = modPow(g, a, p);
        sBob = modPow(A, b, p);
        flash(S2Box);
        break;
      case 9: // verifikasi
        break;
    }
    updateComputedBoxes();
    renderSteps();
  }

  function prevStep() {
    if (stepIdx <= 0) return;
    stepIdx--;
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
    btnPrev.disabled = true;
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
    btnPrev.disabled = false;
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
  btnPrev.addEventListener('click', prevStep);
  btnAuto.addEventListener('click', toggleAuto);
  btnReset.addEventListener('click', resetAll);
  btnVerbose.addEventListener('click', () => {
    verbose = !verbose;
    btnVerbose.textContent = verbose ? 'Mode Ringkas' : 'Mode Rinci';
    renderSteps();
  });

  // If user edits inputs, stop autoplay and clear computed
  for (const inp of [pInput, gInput, aInput, bInput]) {
    inp.addEventListener('input', () => { stopAuto(); clearComputed(); stepIdx = 0; setStepIndicator(); stepsBox.textContent = ''; setMessage(''); });
  }

  // Copy mini buttons (delegated)
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.copy-mini');
    if (!btn) return;
    const targetId = btn.getAttribute('data-copy-target');
    if (!targetId) return;
    const span = el(targetId);
    const text = span && span.textContent ? span.textContent.trim() : '';
    if (!text || text === '?') { setMessage('Tidak ada nilai untuk disalin.'); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      setMessage(`Disalin: ${text}`);
    } catch (e) {
      setMessage('Gagal menyalin ke clipboard.');
    }
  });

  // Init from defaults
  validateParams(false);
  clearComputed();
  renderSteps();
})();
