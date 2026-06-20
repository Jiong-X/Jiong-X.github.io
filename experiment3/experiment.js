// ── Constants ──
const SLIDER_MIN  = 0;
const SLIDER_MAX  = 30;
const TARGET_HALF = 1.5;
const TRACK_H     = 380;
const HANDLE_H    = 18;   // handle height in px (rect)
const MAX_STEPS   = 40;

// chart colours
const zColour  = 'rgb(0, 204, 102)';
const zLine    = 'rgb(0, 153, 76)';
const rShade   = 'rgba(212, 175, 55, 0.5)';
const rCurrent = 'rgba(46, 160, 67, 0.65)';  // green for current target column

// ── State ──
let functionalForm   = 'linear_sum';
let stepCount        = 0;
let score            = 0;
let targetCentre     = 150;
let cHistory         = {};
let hitHistory       = {};   // step → boolean
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
const stepDisplay  = document.getElementById('step-count');
const scoreDisplay = document.getElementById('score-display');
const ruleToggle     = document.getElementById('rule-toggle');
const ruleDropdown   = document.getElementById('rule-dropdown');
const resetBtn       = document.getElementById('reset-btn');
const funcName       = document.getElementById('func-name');
const ruleRevealBtn  = document.getElementById('rule-reveal-btn');
let   ruleVisible    = false;

const ruleNames = {
    linear_sum:        'Linear Sum',
    exp_sum:           'Exponential Sum',
    quadratic_sum:     'Quadratic Sum',
    linear_product:    'Linear Product',
    exp_product:       'Exponential Product',
    quadratic_product: 'Quadratic Product',
    ridge_sum:         'Ridge Sum'
};

// ── Random target trajectory ──
// Smooth random walk with momentum, clamped to valid range.
function generateTrajectory(nSteps) {
    const traj = [];
    const lo = TARGET_HALF + 1, hi = SLIDER_MAX - TARGET_HALF - 1;
    for (let i = 0; i <= nSteps + 15; i++) {
        traj.push(Math.round(lo + Math.random() * (hi - lo)));
    }
    return traj;
}

function getTarget(step) {
    if (step < 0) step = 0;
    return targetTrajectory[step] !== undefined
        ? targetTrajectory[step]
        : targetTrajectory[targetTrajectory.length - 1];
}

// ── Causal rules (from sliders.js) ──
function computeC(a, b) {
    let c;
    switch (functionalForm) {
        case 'linear_sum':
            // c = 0.5a + 0.5b; range [0,30]
            c = 0.5 * a + 0.5 * b; break;
        case 'exp_sum':
            // exponential, 0 at (0,0), 30 at (30,30)
            c = 15*(Math.exp(a/10)-1)/(Math.exp(3)-1) + 15*(Math.exp(b/10)-1)/(Math.exp(3)-1); break;
        case 'quadratic_sum':
            // U-shaped: min 0 at (15,15), max 30 at corners
            c = (a-15)*(a-15)/15 + (b-15)*(b-15)/15; break;
        case 'linear_product':
            // c = a*b/30; range [0,30]
            c = a * b / 30; break;
        case 'exp_product':
            // exponential product, 0 at origin, 30 at (30,30)
            c = 30 * (Math.exp(a/30)-1) * (Math.exp(b/30)-1) / ((Math.E-1)*(Math.E-1)); break;
        case 'quadratic_product':
            // hill: 0 at boundaries, 30 at centre (15,15)
            c = 16 * a * (30-a) * b * (30-b) / 27000; break;
        case 'ridge_sum':
            // tent/ridge: peaks at (15,15)=30, 0 at boundaries, nonmonotonic
            c = Math.min(a, 30-a) + Math.min(b, 30-b); break;
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

function updateAB() {
    const a = +sliderA.value, b = +sliderB.value;
    valA.textContent = a;
    valB.textContent = b;
    fillA.style.height = fillPct(a) + '%';
    fillB.style.height = fillPct(b) + '%';
    positionHandle(handleA, a);
    positionHandle(handleB, b);
}

// ── Chart window helpers ──
// Centre: last revealed step (or 5 if < 5 steps taken), so revealed dot lands at index 5.
function chartCentre() { return Math.max(5, stepCount - 1); }

// Index of the last revealed C dot within the 11-column window.
function dotIndex() {
    if (stepCount === 0) return -1;
    return (stepCount - 1) - (chartCentre() - 5);
}

// Index of the CURRENT target column (the step the participant is aiming for next).
function targetColIndex() {
    return stepCount - (chartCentre() - 5);
}

function buildChartData() {
    const centre = chartCentre();
    const labels = [], data = [];
    for (let i = -5; i <= 5; i++) {
        const s = centre + i;
        labels.push(Math.max(0, s));
        data.push(s >= 0 && cHistory[s] !== undefined ? cHistory[s] : null);
    }
    return { labels, data };
}

// ── Chart ──
let chart;

function setupChart() {
    const ctx = document.getElementById('progressPlot').getContext('2d');
    const { labels, data } = buildChartData();

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
                    const stepNum = chart.data.labels[ctx.dataIndex];
                    return hitHistory[stepNum] ? 6 : 4;
                },
                pointBackgroundColor: zColour,
                tension: 0,
                data,
                fill: false,
                spanGaps: false
            }]
        },
        options: {
            legend: { display: false },
            animation: { duration: 0 },
            scales: {
                yAxes: [{ ticks: { suggestedMin: 0, suggestedMax: 30, beginAtZero: false } }],
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
    const { labels, data } = buildChartData();
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
}

// ── Space: reveal C, score, advance ──
function step() {
    if (stepCount >= MAX_STEPS) return;
    const a = +sliderA.value, b = +sliderB.value;
    const c = computeC(a, b);

    cHistory[stepCount] = c;

    const inTarget = c >= targetCentre - TARGET_HALF && c <= targetCentre + TARGET_HALF;
    hitHistory[stepCount] = inTarget;
    if (inTarget) {
        score++;
        scoreDisplay.textContent = score;
        hitIndicator.textContent = '✓ On target!';
    } else {
        hitIndicator.textContent = '';
    }

    stepCount++;
    stepDisplay.textContent = stepCount;
    targetCentre = getTarget(stepCount);

    // Reset sliders to centre for next step
    sliderA.value = 15;
    sliderB.value = 15;
    updateAB();

    refreshChart();
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
    stepDisplay.textContent  = 0;
    scoreDisplay.textContent = 0;
    hitIndicator.textContent = '';
    sliderA.value = 15;
    sliderB.value = 15;
    targetTrajectory = generateTrajectory(MAX_STEPS);
    targetCentre     = getTarget(0);
    pickRandomRule();
    updateAB();
    if (chart) refreshChart();
}

// ── Events ──
sliderA.addEventListener('input', updateAB);
sliderB.addEventListener('input', updateAB);

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

document.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
        e.preventDefault();
        step();
    }
});

// ── Init ──
targetTrajectory = generateTrajectory(MAX_STEPS);
targetCentre     = getTarget(0);
updateAB();
setupChart();
// Start with rule hidden
funcName.style.visibility = 'hidden';
ruleRevealBtn.textContent  = 'Show Rule';
