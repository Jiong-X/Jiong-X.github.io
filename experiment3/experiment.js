// ── Constants ──
const SLIDER_MIN  = 0;
const SLIDER_MAX  = 100;
const SLIDER_MID  = SLIDER_MAX / 2;
const TARGET_HALF = 5;      // target zone = ±5 (10% of range, as before)
// Track and handle sizes come from the CSS, so the same script works for
// the timeline version (index.html) and the large-slider version (sliders.html).
const TRACK_H     = document.getElementById('track-a').offsetHeight || 380;
const HANDLE_H    = document.getElementById('handle-a').offsetHeight || 18;
const MAX_STEPS   = 40;

// chart colours
const aLine    = 'rgb(25, 118, 210)';   // matches slider A
const bLine    = 'rgb(198, 40, 40)';    // matches slider B
const zColour  = 'rgb(0, 204, 102)';
const zLine    = 'rgb(0, 153, 76)';
const rShade   = 'rgba(212, 175, 55, 0.35)';  // upcoming / past target regions (pale yellow)
const rCurrent = 'rgba(249, 168, 37, 0.85)'; // current target region (yellow, matches C slider band)

// ── State ──
let functionalForm   = 'linear_sum';
let stepCount        = 0;
let score            = 0;
let targetCentre     = SLIDER_MID;
let cHistory         = {};
let hitHistory       = {};   // step → boolean
let aHistory         = {};   // step → A value used
let aSet             = false; // has the participant placed A this step?
let bSet             = false; // has the participant placed B this step?
let bHistory         = {};   // step → B value used
let targetTrajectory = [];   // pre-generated random trajectory

// ── DOM ──
const sliderA      = document.getElementById('slider-a');
const sliderB      = document.getElementById('slider-b');
const valA         = document.getElementById('val-a');
const valB         = document.getElementById('val-b');
const fillA        = document.getElementById('fill-a');
const fillB        = document.getElementById('fill-b');
const handleA      = document.getElementById('handle-a');
const handleB      = document.getElementById('handle-b');
const hitIndicator = document.getElementById('hit-indicator');
const valC         = document.getElementById('val-c');
const fillC        = document.getElementById('fill-c');
const handleC      = document.getElementById('handle-c');
const targetBandC  = document.getElementById('target-band-c');
const prevA        = document.getElementById('prev-a');
const prevB        = document.getElementById('prev-b');
const stepDisplay  = document.getElementById('step-count');
const scoreDisplay = document.getElementById('score-display');
const ruleToggle     = document.getElementById('rule-toggle');
const ruleDropdown   = document.getElementById('rule-dropdown');
const resetBtn       = document.getElementById('reset-btn');
const funcName       = document.getElementById('func-name');
const ruleRevealBtn  = document.getElementById('rule-reveal-btn');
let   ruleVisible    = false;
const condSelect     = document.getElementById('cond-select');

const ruleNames = {
    linear_sum:        'Linear Sum',
    exp_sum:           'Exponential Sum',
    quadratic_sum:     'Quadratic Sum',
    linear_product:    'Linear Product',
    exp_product:       'Exponential Product',
    quadratic_product: 'Quadratic Product',
    ridge_sum:         'Ridge Sum',
    ridge_product:     'Ridge Product'
};

// ── Conditions ──
// The distance between consecutive targets is drawn from a normal
// distribution; its mean depends on the condition and on which half of the
// task we are in. Direction (up/down) is random. Units: 0–100 scale.
// Hard phase: mean 40; easy phase: mean 20; SD 10 in both. Each condition runs
// one phase per half (steps 1–20, then 21–40), in opposite orders.
const MEAN_HARD = 40;
const MEAN_EASY = 20;
const JUMP_SD   = 10;
// Adjacent target zones must not overlap: each zone spans ±TARGET_HALF, so
// consecutive targets must be more than 2·TARGET_HALF apart.
const MIN_JUMP = 2 * TARGET_HALF + 1;
// Closest a target zone may come to the edge of the scale (0 or 100).
const EDGE_GAP = 5;
const CONDITIONS = {
    hard_first: { label: 'Hard first', meanFirstHalf: MEAN_HARD, meanSecondHalf: MEAN_EASY },
    easy_first: { label: 'Easy first', meanFirstHalf: MEAN_EASY, meanSecondHalf: MEAN_HARD }
};
let condition = pickCondition();

// Condition comes from ?cond=hard_first|easy_first, otherwise random.
function pickCondition() {
    const fromUrl = new URLSearchParams(window.location.search).get('cond');
    if (fromUrl && CONDITIONS[fromUrl]) return fromUrl;
    const keys = Object.keys(CONDITIONS);
    return keys[Math.floor(Math.random() * keys.length)];
}

// Standard normal via Box–Muller.
function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Random target trajectory ──
// Index 0 is the starting point (initial C, no target). Targets run from
// step 1 to step nSteps. Step 1's target is a random integer. The direction
// (up or down) is chosen at random once, and the target keeps moving that way.
// If a jump would push the zone past the allowed range, the target is
// placed at the edge of that range — the zone sits EDGE_GAP points in from
// the boundary of the scale — and the direction reverses for the following
// steps. If the target is already too
// close to the edge for that (the move would be under MIN_JUMP), it turns
// round straight away instead.
// Each jump distance is drawn from N(mean, JUMP_SD), where the mean is set by
// the half (steps 2–20 first half, 21–40 second half), and is redrawn if it
// is below MIN_JUMP (zones would overlap).
function generateTrajectory(nSteps) {
    const cfg = CONDITIONS[condition];
    // Zone stays EDGE_GAP points inside the scale: centres 10–90 (zones 5–15 … 85–95)
    const lo = TARGET_HALF + EDGE_GAP, hi = SLIDER_MAX - TARGET_HALF - EDGE_GAP;
    const half = nSteps / 2;
    let t = lo + Math.floor(Math.random() * (hi - lo + 1));
    let dir = Math.random() < 0.5 ? -1 : 1;
    const traj = [null, t];
    for (let i = 2; i <= nSteps; i++) {
        const mean = (i <= half) ? cfg.meanFirstHalf : cfg.meanSecondHalf;
        let next = null;
        while (next === null) {
            const dist = Math.round(mean + randn() * JUMP_SD);
            if (dist < MIN_JUMP) continue;
            const edge = dir > 0 ? hi : lo;
            if (t + dir * dist >= lo && t + dir * dist <= hi) {
                next = t + dir * dist;                    // keep going
            } else if (Math.abs(edge - t) >= MIN_JUMP) {
                next = edge;                              // stop at the edge…
                dir = -dir;                               // …and head back next time
            } else {
                dir = -dir;                               // already at the edge: turn round
                if (t + dir * dist >= lo && t + dir * dist <= hi) next = t + dir * dist;
                else dir = -dir;                          // doesn't fit either way: redraw
            }
        }
        t = next;
        traj.push(t);
    }
    return traj;
}

function getTarget(step) {
    if (step < 1) step = 1;
    return targetTrajectory[step] !== undefined
        ? targetTrajectory[step]
        : targetTrajectory[targetTrajectory.length - 1];
}

// ── Causal rules ──
// All rules map A, B ∈ [0, 100] to C ∈ [0, 100].
function computeC(a, b) {
    const R = SLIDER_MAX, M = SLIDER_MID;
    let c;
    switch (functionalForm) {
        case 'linear_sum':
            // C = 0.5A + 0.5B
            c = 0.5 * a + 0.5 * b; break;
        case 'exp_sum':
            // C = 50·(e^(3A/100) − 1)/(e^3 − 1) + 50·(e^(3B/100) − 1)/(e^3 − 1)
            c = M*(Math.exp(3*a/R)-1)/(Math.exp(3)-1) + M*(Math.exp(3*b/R)-1)/(Math.exp(3)-1); break;
        case 'quadratic_sum':
            // U-shaped: C = (A−50)²/50 + (B−50)²/50; 0 at (50,50), 100 at corners
            c = (a-M)*(a-M)/M + (b-M)*(b-M)/M; break;
        // ── Multiplicative rules ──
        // Each slider goes through its own curve g (0 → 100), then
        //   C = ((g(A) + 30) · (g(B) + 30) − 900) / 160
        // The +30 offset means no single slider can take C anywhere alone
        // (at best it covers ~19–100); subtracting 900 (= 30·30) and dividing
        // by 160 rescales so C runs exactly 0 → 100. C = 0 only when
        // g(A) = g(B) = 0.
        case 'linear_product':
            // g(x) = x
            c = ((a + 30) * (b + 30) - 900) / 160; break;
        case 'exp_product':
            // g(x) = 100·(e^(3x/100) − 1)/(e³ − 1): flat, then steep
            {
                const u = x => R * (Math.exp(3*x/R) - 1) / (Math.exp(3) - 1);
                c = ((u(a) + 30) * (u(b) + 30) - 900) / 160;
            }
            break;
        case 'quadratic_product':
            // Valley (as in the original R version):
            // g(x) = (x − 50)²/25, 0 at x = 50 and 100 at the edges
            {
                const h = x => (x - M) * (x - M) / (M * M / R);
                c = ((h(a) + 30) * (h(b) + 30) - 900) / 160;
            }
            break;
        case 'ridge_product':
            // V-shaped valley, product version of Ridge Sum:
            // g(x) = 2·|x − 50|, 0 at x = 50 and 100 at the edges
            {
                const v = x => 2 * Math.abs(x - M);
                c = ((v(a) + 30) * (v(b) + 30) - 900) / 160;
            }
            break;
        case 'ridge_sum':
            // V-shaped valley: C = |A−50| + |B−50|; 0 at (50,50), 100 at corners
            c = Math.abs(a - M) + Math.abs(b - M); break;
        default:
            c = 0.5*a + 0.5*b;
    }
    return Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(c)));
}

// ── Slider UI ──
function fillPct(v) { return (v / SLIDER_MAX) * 100; }

function positionHandle(el, value) {
    // Centre the rect handle on the fill level
    el.style.bottom = ((value / SLIDER_MAX) * TRACK_H - HANDLE_H / 2) + 'px';
}

// Handles (and fills/values) stay hidden until the participant clicks the
// slider on each step.
function showSlider(handle, fill, val, value, isSet) {
    handle.style.visibility = isSet ? 'visible' : 'hidden';
    fill.style.visibility   = isSet ? 'visible' : 'hidden';
    val.textContent         = isSet ? value : '–';
    fill.style.height = fillPct(value) + '%';
    positionHandle(handle, value);
}

function updateAB() {
    showSlider(handleA, fillA, valA, +sliderA.value, aSet);
    showSlider(handleB, fillB, valB, +sliderB.value, bSet);
}

// Dotted markers for the A and B values used on the previous step.
function updatePrevMarkers() {
    // No markers before the first step has been taken
    const show = stepCount > 0;
    prevA.style.display = show ? 'block' : 'none';
    prevB.style.display = show ? 'block' : 'none';
    if (!show) return;
    const pa = aHistory[stepCount], pb = bHistory[stepCount];
    if (pa !== undefined) prevA.style.bottom = (pa / SLIDER_MAX) * TRACK_H + 'px';
    if (pb !== undefined) prevB.style.bottom = (pb / SLIDER_MAX) * TRACK_H + 'px';
}

// ── Read-only C slider ──
// Shows the most recently revealed C (it only updates when Space is pressed,
// so it never gives away C before the participant commits) and the target
// region for the step they are aiming at next.
function updateC() {
    const c = cHistory[stepCount];
    if (c !== undefined) {
        valC.textContent = c;
        fillC.style.height = fillPct(c) + '%';
        positionHandle(handleC, c);
    }
    if (stepCount < MAX_STEPS) {
        const tc = getTarget(stepCount + 1);
        targetBandC.style.display = 'block';
        targetBandC.style.bottom  = ((tc - TARGET_HALF) / SLIDER_MAX) * TRACK_H + 'px';
        targetBandC.style.height  = (2 * TARGET_HALF / SLIDER_MAX) * TRACK_H + 'px';
    } else {
        targetBandC.style.display = 'none';
    }
}

// ── Chart window helpers ──
// Column 0 = step 0 (initial C, no target); column k = step k.
// Once past step 5 the window scrolls so the latest C dot stays at index 5.
function windowStart() { return Math.max(0, stepCount - 5); }

// Index of the latest revealed C dot (initial C at the start).
function dotIndex() { return stepCount - windowStart(); }

// Index of the CURRENT target column (the step the participant is aiming for next).
function targetColIndex() { return stepCount + 1 - windowStart(); }

function buildChartData() {
    const start = windowStart();
    const labels = [], data = [], aData = [], bData = [];
    for (let i = 0; i <= 10; i++) {
        const s = start + i;
        labels.push(s);
        data.push(cHistory[s] !== undefined ? cHistory[s] : null);
        aData.push(aHistory[s] !== undefined ? aHistory[s] : null);
        bData.push(bHistory[s] !== undefined ? bHistory[s] : null);
    }
    return { labels, data, aData, bData };
}

// Initial C: the outcome with both sliders at their starting position.
function setInitialC() {
    cHistory[0] = computeC(SLIDER_MID, SLIDER_MID);
    aHistory[0] = SLIDER_MID;
    bHistory[0] = SLIDER_MID;
}

// ── Chart ──
let chart;

// The timeline chart has been removed from the page; these functions do
// nothing when there is no canvas (kept so it can be restored easily).
function setupChart() {
    if (!document.getElementById('progressPlot') || typeof Chart === 'undefined') return;
    const ctx = document.getElementById('progressPlot').getContext('2d');
    const { labels, data, aData, bData } = buildChartData();

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'C',
                borderColor: zLine,
                borderWidth: 2,
                pointRadius: function(ctx) {
                    if (ctx.dataIndex !== dotIndex()) return 4;
                    const stepNum = ctx.chart.data.labels[ctx.dataIndex];
                    return hitHistory[stepNum] ? 6 : 4;
                },
                pointBackgroundColor: zColour,
                tension: 0,
                data,
                fill: false,
                spanGaps: false
            }, {
                label: 'A',
                borderColor: aLine,
                backgroundColor: aLine,
                borderWidth: 1.5,
                borderDash: [5, 4],
                pointRadius: 3,
                pointBackgroundColor: aLine,
                tension: 0,
                data: aData,
                fill: false,
                spanGaps: false
            }, {
                label: 'B',
                borderColor: bLine,
                backgroundColor: bLine,
                borderWidth: 1.5,
                borderDash: [5, 4],
                pointRadius: 3,
                pointBackgroundColor: bLine,
                tension: 0,
                data: bData,
                fill: false,
                spanGaps: false
            }]
        },
        options: {
            legend: { display: true, position: 'top', labels: { boxWidth: 14 } },
            animation: { duration: 0 },
            scales: {
                yAxes: [{ ticks: { suggestedMin: 0, suggestedMax: SLIDER_MAX, beginAtZero: false } }],
                xAxes: [{ scaleLabel: { display: true, labelString: 'Steps' } }]
            }
        },
        plugins: [{
            beforeDraw: function(ch) {
                const ctx2   = ch.ctx;
                const area   = ch.chartArea;
                const chartH = area.bottom - area.top;
                const chartW = area.right  - area.left;
                const segW   = chartW / 10;
                const curIdx = targetColIndex();   // column to highlight green

                ctx2.save();

                for (let i = 0; i < 11; i++) {
                    const stepNum = ch.data.labels[i];
                    if (stepNum === 0 || stepNum > MAX_STEPS) continue;   // no target at start or after the last step
                    const tc      = getTarget(stepNum);
                    const yTop    = area.top + ((SLIDER_MAX - (tc + TARGET_HALF)) / SLIDER_MAX) * chartH;
                    const rectH   = (TARGET_HALF * 2 / SLIDER_MAX) * chartH;
                    const xLeft   = (i === 0)  ? area.left             : area.left + i * segW - segW / 2;
                    const width   = (i === 0 || i === 10) ? segW / 2   : segW;

                    ctx2.fillStyle = (i === curIdx) ? rCurrent : rShade;
                    ctx2.fillRect(xLeft, yTop, width, rectH);
                }
                ctx2.restore();
            }
        }]
    });
}

function refreshChart() {
    if (!chart) return;
    const { labels, data, aData, bData } = buildChartData();
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[1].data = aData;
    chart.data.datasets[2].data = bData;
    chart.update();
}

// ── Space: reveal C, score, advance ──
function step() {
    if (stepCount >= MAX_STEPS) return;
    if (!aSet || !bSet) {
        hitIndicator.textContent = 'Click on both sliders A and B to set them first.';
        hitIndicator.classList.remove('hit', 'miss');
        hitIndicator.classList.add('warn');
        return;
    }
    hitIndicator.classList.remove('warn');
    const a = +sliderA.value, b = +sliderB.value;
    const c = computeC(a, b);

    const thisStep = stepCount + 1;
    cHistory[thisStep] = c;
    aHistory[thisStep] = a;
    bHistory[thisStep] = b;

    const inTarget = c >= targetCentre - TARGET_HALF && c <= targetCentre + TARGET_HALF;
    hitHistory[thisStep] = inTarget;
    // Feedback: did this step earn a point?
    hitIndicator.classList.remove('hit', 'miss');
    if (inTarget) {
        score++;
        scoreDisplay.textContent = score;
        hitIndicator.textContent = '✓ On target! +1 point';
        hitIndicator.classList.add('hit');
    } else {
        hitIndicator.textContent = '✗ Missed the target. No point this step.';
        hitIndicator.classList.add('miss');
    }

    stepCount++;
    stepDisplay.textContent = stepCount;
    targetCentre = getTarget(stepCount + 1);

    // Hide the handles for the next step; participants must click again
    sliderA.value = SLIDER_MID;
    sliderB.value = SLIDER_MID;
    aSet = false;
    bSet = false;
    updateAB();
    updatePrevMarkers();

    refreshChart();
    updateC();
}

function pickRandomRule() {
    const keys = Object.keys(ruleNames);
    functionalForm = keys[Math.floor(Math.random() * keys.length)];
    funcName.textContent = ruleNames[functionalForm];
    ruleDropdown.querySelectorAll('.rule-option').forEach(function (o) {
        o.classList.toggle('active', o.dataset.value === functionalForm);
    });
}

// ── Reset ──
function resetExperiment() {
    stepCount    = 0;
    score        = 0;
    cHistory     = {};
    hitHistory   = {};
    aHistory     = {};
    bHistory     = {};
    stepDisplay.textContent  = 0;
    scoreDisplay.textContent = 0;
    hitIndicator.textContent = '';
    hitIndicator.classList.remove('warn', 'hit', 'miss');
    aSet = false;
    bSet = false;
    sliderA.value = SLIDER_MID;
    sliderB.value = SLIDER_MID;
    targetTrajectory = generateTrajectory(MAX_STEPS);
    targetCentre     = getTarget(1);
    pickRandomRule();
    setInitialC();
    updateAB();
    if (chart) refreshChart();
    updateC();
    updatePrevMarkers();
}

// ── Events ──
function revealA() { aSet = true; updateAB(); clearWarn(); }
function revealB() { bSet = true; updateAB(); clearWarn(); }
function clearWarn() {
    if (hitIndicator.classList.contains('warn')) {
        hitIndicator.textContent = '';
        hitIndicator.classList.remove('warn');
    }
}
sliderA.addEventListener('pointerdown', revealA);
sliderB.addEventListener('pointerdown', revealB);
sliderA.addEventListener('input', revealA);
sliderB.addEventListener('input', revealB);

ruleToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    const open = ruleDropdown.style.display === 'block';
    ruleDropdown.style.display = open ? 'none' : 'block';
});

ruleDropdown.querySelectorAll('.rule-option').forEach(function (el) {
    el.addEventListener('click', function () {
        functionalForm = this.dataset.value;
        funcName.textContent = ruleNames[functionalForm];
        ruleDropdown.querySelectorAll('.rule-option').forEach(o => o.classList.remove('active'));
        this.classList.add('active');
        ruleDropdown.style.display = 'none';
        if (stepCount === 0) { setInitialC(); refreshChart(); updateC(); }
    });
});

document.addEventListener('click', function () {
    ruleDropdown.style.display = 'none';
});

ruleRevealBtn.addEventListener('click', function () {
    ruleVisible = !ruleVisible;
    funcName.style.visibility = ruleVisible ? 'visible' : 'hidden';
    ruleRevealBtn.textContent  = ruleVisible ? 'Hide Rule' : 'Show Rule';
});

resetBtn.addEventListener('click', resetExperiment);

condSelect.addEventListener('change', function () {
    condition = this.value;
    resetExperiment();
    this.blur();   // keep Space for stepping
});

document.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
        e.preventDefault();
        step();
    }
});

// ── Init ──
Object.keys(CONDITIONS).forEach(function (k) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = CONDITIONS[k].label;
    condSelect.appendChild(opt);
});
condSelect.value = condition;
targetTrajectory = generateTrajectory(MAX_STEPS);
targetCentre     = getTarget(1);
setInitialC();
updateAB();
setupChart();
updateC();
updatePrevMarkers();
// Start with rule hidden
funcName.style.visibility = 'hidden';
ruleRevealBtn.textContent  = 'Show Rule';
