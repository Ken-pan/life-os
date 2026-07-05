/** English library article bodies keyed by entry id */
export default {
  frequency: {
    html: `<p>Hypertrophy isn't built by one "perfect split" — it's built by stacking <b>effective volume, training close enough to failure, progressive overload, and recovery that keeps up</b> over time. Prioritize weekly effective sets per muscle group, then use training frequency to spread those sets across higher-quality sessions.</p>
    <p>For most natural lifters, <b>2× per week per muscle</b> is a practical default — <b>usually easier to distribute effective volume than 1×</b>; but when <b>total effective sets are equal</b>, frequency alone doesn't reliably add extra hypertrophy. Training 3+ times per week doesn't necessarily build more muscle, but it can <b>spread volume, lower per-session fatigue, and improve movement quality</b>; total fatigue still depends on total sets, RIR, sleep, and exercise selection.</p>
    <ul>
      <li>Same muscle group: ideally <b>48–72 hours</b> between sessions</li>
      <li>Chest/back/arms/legs rotation: training <b>5–6 days/week</b>, each muscle gets roughly <b>1.3–1.5×/week</b>; for serious hypertrophy, aim to complete <b>1.5+ full rotations per week</b></li>
      <li>When frequency is low: you can <b>short-term</b> compensate with higher per-session volume, but <b>long-term</b> avoid cramming too many sets into one session — quality drops on later sets</li>
      <li>At least <b>10 effective sets/week per muscle</b> as a hypertrophy starting point; most working sets at <b>1–3 RIR</b></li>
      <li>Poor sleep, joint discomfort, or performance dropping session after session: cut volume first — don't force load increases</li>
    </ul>`,
    cite: 'Source: ACSM 2026 resistance training position stand; Schoenfeld training frequency meta-analysis; RP volume landmarks'
  },
  'volume-landmarks': {
    html: `<p>Volume landmarks help you tell whether you're <b>under-training, in the sweet spot, or over-reaching</b>. This follows the <b>RP / Israetel coaching model</b>, conservatively adjusted against weekly volume research — <b>not a fixed prescription</b>. The app adjusts ±10–30% based on performance, soreness, sleep, and joint feedback.</p>
    <ul>
      <li><b class="mev">MEV</b>: Minimum Effective Volume — below this you usually only maintain</li>
      <li><b class="mav">MAV</b>: Maximum Adaptive Volume — the main hypertrophy sweet spot long-term</li>
      <li><b class="mrv">MRV</b>: Maximum Recoverable Volume — beyond this recovery can't keep up; performance and joint risk worsen</li>
    </ul>
    <p>Effective sets count only working sets that are close to failure, technically sound, and clearly target the intended muscle. Compounds can credit smaller muscles at 0.5 sets indirect volume, but that doesn't fully replace isolation work.</p>`,
    table: [
      ['Muscle group', 'MEV', 'MAV (sweet spot)', 'MRV'],
      ['Chest', '8', '12–18', '20+'],
      ['Back', '8', '12–20', '22+'],
      ['Lateral/rear delt', '6', '12–20', '22+'],
      ['Biceps', '6–8', '10–16', '20+'],
      ['Triceps', '6–8', '10–16', '20+'],
      ['Quads', '8', '12–18', '20+'],
      ['Hamstrings', '6', '8–14', '18+']
    ],
    cite: 'RP/Israetel coaching model · not a clinical fixed prescription · individual variation ±30–50%; fine-tune with soreness, performance, and recovery signals'
  },
  'effective-sets': {
    html: `<p>Not every set you "did" counts as effective volume — app stats and recommendations use <b>effective sets</b> so warm-ups, technique sets, and junk volume don't inflate totals.</p>
    <ul>
      <li>If RIR is uncertain, err conservative — better to under-count than treat easy sets as effective volume</li>
      <li>Early in a block or on a new lift: first 1–2 sets at wide RIR (3+) are fine to do but <b>don't count toward weekly effective volume</b></li>
      <li>Deload week: after halving sets, remaining working sets still follow effective-set rules</li>
      <li><b>App rule</b>: sets marked "form breakdown" or "joint pain" can be logged but <b>don't count as effective volume</b></li>
    </ul>
    <p>Effective sets are the unit for volume landmarks (MEV/MAV/MRV) — landmark numbers mean effective sets, not "sets showed up for."</p>`,
    table: [
      ['Counts as effective', "Doesn't count"],
      ['Target muscle clearly working', 'Warm-up only'],
      ['Solid form, sufficient ROM', 'Partial reps, excessive momentum/cheat'],
      ['Roughly 0–3 RIR', 'Too far from failure, 4+ RIR'],
      ['Stable working weight', 'Just finding groove or testing weight']
    ],
    cite: 'Source: RP / Israetel effective set definition; Schoenfeld weekly volume dose-response review; ACSM 2026 training prescription variables'
  },
  'indirect-volume': {
    html: `<p>Compound lifts "carry over" to smaller muscles, but <b>can't fully replace</b> isolation. For weekly volume estimates, indirect credit is <b>0.5 sets per effective set</b> — so arm day + chest/back day doesn't slowly push biceps/triceps toward or past MRV.</p>
    <ul>
      <li><b>Face pull / reverse fly</b> → rear delt counts as <b>1 set</b> (direct isolation/corrective)</li>
      <li><b>Lateral raise / machine lateral</b> → side delt counts as <b>1 set</b>; bench and face pulls <b>cannot</b> replace side delt work</li>
      <li>Isolation leg curl, curl, pushdown, etc. → target muscle <b>1 set</b>, no indirect credit</li>
    </ul>
    <p>Example: chest day 4 bench + 3 pushdown → chest 7 effective sets; triceps ~2 (pushdown) + 2 (bench indirect) = 4 triceps sets. Still give triceps direct isolation volume on arm day.</p>`,
    table: [
      ['Exercise', 'Primary muscle', 'Indirect volume'],
      ['Bench press', 'Chest', 'Triceps 0.5 sets; front delt 0.5 sets'],
      ['Incline press', 'Upper chest', 'Front delt 0.5–1 sets; triceps 0.5 sets'],
      ['Pulldown / pull-up', 'Back', 'Biceps 0.5 sets'],
      ['Row', 'Back / upper back', 'Biceps 0.5 sets; rear delt 0.5 sets'],
      ['Squat / hack squat', 'Quads', 'Glutes 0.5 sets'],
      ['RDL', 'Hamstrings / glutes', 'Lower back 0.5 sets']
    ],
    cite: 'Source: RP indirect volume estimates; NSCA regional hypertrophy review'
  },
  rir: {
    html: `<p><b>RIR = Reps In Reserve</b> — how many more reps you could do with good form at set end. The most practical way to control training intensity.</p>
    <p><b>Default strategy</b>: big compounds mostly at <b>1–3 RIR</b>; isolation last sets can occasionally hit <b>0–1 RIR</b>. Don't train every set to failure — fatigue rises faster than benefit. On new lifts or early in a block, stay conservative (+1 RIR), then creep closer to failure.</p>`,
    rules: [
      ['RIR', 'Feel · best use'],
      ['0', 'True failure · isolation/machine last set, occasional use'],
      ['1', 'Near limit · main hypertrophy zone, strong stimulus'],
      ['2', 'Hard but controlled · default for most working sets'],
      ['3', 'Still solid · block start, compounds, new lifts'],
      ['4+', 'Light · warm-up, technique, recovery day']
    ],
    cite: 'Source: Grgic proximity-to-failure meta-analysis; RP RIR framework'
  },
  'progressive-overload': {
    rules: [
      ['Session result', 'Next session'],
      ['All sets hit rep ceiling with 2+ RIR left', '<span class="add">Add weight</span>: cable +5 lbs / dumbbell +2.5 lbs'],
      ['Hit target reps but last 1–2 reps very hard', '<span class="hold">Keep weight</span>, challenge again next time'],
      ["Didn't hit target reps", '<span class="hold">Keep weight</span>, build reps first'],
      ['Form breakdown / joint discomfort', '<span class="warn">Drop 10–15%</span>, shorten ROM or swap exercise'],
      ['Stuck 2–3 sessions in a row', 'Check sleep, nutrition, fatigue; <span class="warn">deload</span> if needed']
    ],
    html: `<p>Standardize form before chasing load. Any progress counts as <b>progressive overload</b>: weight, reps, sets, cleaner technique, fuller ROM, same weight at lower RIR. The app defaults to <b>double progression</b> — fill the rep range at a given weight, then add a small increment.</p>`
  },
  'add-sets-not-weight': {
    html: `<p>Adding weight isn't the only way to progress. When weight/reps stall but <b>recovery is good</b>, adding 1–2 effective sets is often safer than forcing load — part of the app coach logic.</p>
    <ul>
      <li><b>How to add sets</b>: +1–2 effective sets/week per muscle toward MAV sweet spot; prioritize <b>isolation/weak-point lifts</b></li>
      <li><b>Weight first or sets first</b>: reps not at top of range → chase reps; reps maxed with wide RIR → add weight; reps maxed but load would hurt quality → add sets</li>
      <li>After deload: restart from MEV — don't jump straight back to pre-deload set counts</li>
    </ul>`,
    rules: [
      ['Situation', 'Add sets?'],
      ['Weight and reps both climbing', 'No rush to add'],
      ['Target muscle not sore/pumped, recovery great', 'Can +1–2 sets'],
      ['Performance stuck but sleep/nutrition good', 'Try +1 set for 1 week'],
      ['Joint discomfort or poor sleep', "Don't add — maybe cut"],
      ['Same-muscle soreness affecting next session', "Don't add"]
    ],
    cite: 'Source: RP volume progression framework; Schoenfeld weekly volume dose-response'
  },
  rotation: {
    html: `<p>Chest → back → legs → arms in <b>rotating order</b> — not locked to specific weekdays. Finish a day on the summary screen with "Complete workout" and the app recommends the next day. To swap days, change "Today's recommendation" in settings.</p>
    <p>Arm size priority: leg day between back and arms as a recovery buffer — arm day doesn't follow back day directly.</p>
    <ul>
      <li><b>Chest day</b>: chest + front delt indirect; triceps saved for arm day</li>
      <li><b>Back day</b>: lats, upper back, rear delt — no curl pre-fatigue</li>
      <li><b>Leg day</b>: quads, hamstrings, glutes — buffer before arm day</li>
      <li><b>Arm day</b>: high-quality direct biceps/triceps volume — upper-body size focus</li>
      <li>Want faster hypertrophy: increase weekly frequency so the 4-day loop completes <b>1.5+ rotations/week</b></li>
    </ul>
    <p><b>Posture correction</b>: rounded shoulders need <b>face pulls, reverse fly, rows, thoracic extension</b>, and scapular retraction — <b>back extension</b> mainly supports posterior chain and hip stability, not primary rounded-shoulder fix. <b>Side delts</b>: keep lateral raises or machine laterals — bench and face pulls can't fully replace side delt work.</p>`
  },
  'personal-records': {
    html: `<p>Based on your <b>180+</b> coached sessions from 2023–2026:</p>
    <ul>
      <li><b>Back/legs foundation solid</b>: lat pulldown 130–150, pull-ups 8–12, hip thrust/hack 120 kg, leg extension 150+ — room to keep pushing intensity</li>
      <li><b>Upper body is the main focus</b>: bench 80–90 lb×8, incline DB 47.5, curls 60, pushdown 110 — arm day already at high MAV; steady load increases are appropriate</li>
      <li><b>Posture weak point</b>: chronic late nights + desk work → rounded shoulders — take <b>face pulls and rows</b> seriously on back day, not rushed finishers; back extension for posterior chain quality</li>
      <li><b>Default weights are your recent working loads</b> — tap numbers to change anytime; machine/kg items note conversion</li>
      <li>Recommendation: protein <b>1.6–2.2 g/kg</b> (~<b>140–195 g/day</b>), try to sleep before midnight — recovery and arm size will improve faster</li>
    </ul>`,
    cite: 'Analysis source: KEN coach training log (Aug 2023 – Jun 2026, 180+ sessions)'
  },
  deload: {
    html: `<p>Muscle doesn't grow during the workout — it adapts to training stress during <b>recovery</b>.</p>
    <p>Default: <b>check every 4–6 weeks</b> whether a deload is needed, but <b>don't deload mechanically</b> — deload early when:</p>
    <ul>
      <li>Main lifts drop reps or load noticeably two sessions in a row</li>
      <li>Same joint uncomfortable for more than 1 week</li>
      <li>Sleep worsening, training motivation clearly down</li>
      <li>Still sore when the next same-muscle session arrives</li>
      <li>RIR estimates get worse, form starts breaking down</li>
    </ul>
    <p><b>Deload week</b>: halve sets, drop weight 5–10%, widen RIR to 3–4. Goal isn't "easy week" — it's clearing fatigue so the next block can progress again.</p>
    <ul>
      <li>Protein <b>1.6–2.2 g/kg bodyweight/day</b>, sleep <b>7–9 hours</b></li>
      <li>5-minute warm-up; ~50% working weight for movement-specific activation</li>
    </ul>`,
    cite: 'Source: RP reactive deload; ACSM 2026 recovery and sustainability recommendations'
  },
  'compound-isolation': {
    html: `<p>For hypertrophy, <b>compounds vs isolation differ little in total growth</b> — what matters is whether the target muscle gets enough effective volume. Meta-analyses show similar <b>hypertrophy</b> when total sets are equal.</p>
    <ul>
      <li><b>Compounds first</b> (bench, squat, row, pulldown): time-efficient, heavy load, strong neural drive — place at the <b>start</b> of the session</li>
      <li><b>Isolation fills gaps</b>: volume compounds miss (curls for biceps, lateral raises for side delts, face pulls for rear delts)</li>
      <li><b>Regional growth</b>: different regions of the same muscle respond to angles — 2–3 exercises per muscle beats one only</li>
      <li>Weak points or posture fixes (e.g. rounded shoulders): <b>prioritize corrective/isolation volume</b> — don't rush through big compound sets</li>
    </ul>`,
    cite: 'Source: Schoenfeld / Gentil meta-analysis; NSCA regional hypertrophy review'
  },
  'rest-intervals': {
    html: `<p>Rest too short → <b>later sets lose quality and total volume shrinks</b>. For hypertrophy, standard is "next set reps and form don't suffer" — when in doubt rest longer, especially on big compounds.</p>
    <ul>
      <li><b>Big compounds</b> (squat, deadlift, bench, row): <b>2–3 minutes</b> — preserves load and reps, higher total training volume</li>
      <li><b>Isolation / small muscles</b> (curl, pushdown, lateral raise): <b>1–2 minutes</b> usually enough</li>
      <li>Schoenfeld 2016: 3 min vs 1 min rest — after 8 weeks <b>hypertrophy and strength both significantly better</b> — not every lift needs 3 minutes</li>
      <li>Heart rate still high, next set reps drop clearly: rest wasn't enough — that's <b>volume discounted</b>, not "intensity high enough"</li>
      <li>Cutting and short on time: shorten isolation rest first — <b>don't cut compound rest</b></li>
    </ul>`,
    cite: 'Source: Schoenfeld et al. JSCR 2016; NSCA inter-set rest review'
  },
  protein: {
    html: `<p>Training stimulus is only the start — <b>protein intake determines whether muscle actually grows</b>. At ~<b>88 kg</b> bodyweight, hypertrophy/muscle-retention target: <b>140–195 g/day</b>.</p>
    <ul>
      <li><b>ISSN position</b>: <b>1.4–2.0 g/kg/day</b> sufficient for most trainees</li>
      <li><b>Hypertrophy practice (app target)</b>: <b>1.6–2.2 g/kg/day</b> fits lifters better; when cutting, lean-mass basis is fine — don't endlessly stack protein</li>
      <li><b>Per-meal dose</b>: ~<b>0.25 g/kg</b> or <b>25–45 g</b> quality protein with adequate leucine</li>
      <li><b>Meal frequency</b>: spread across 3–5 meals, ~3–4 hours apart — better than one huge bolus</li>
      <li><b>Pre/post workout</b>: no strict 30-minute window — intake within ~2 hours before or after helps; training's <b>anabolic</b> effect lasts at least ~24 hours</li>
      <li>Animal protein, whey, eggs, legumes all work — <b>total amount and complete amino acid profile</b> matter most</li>
    </ul>`,
    cite: 'Source: ISSN Position Stand: Protein and Exercise (2017); Morton meta-analysis'
  },
  'cutting-training': {
    html: `<p>Cutting goal: <b>keep muscle, keep strength, control fatigue</b> — not slash training to cardio levels. Matches your recomp/lean-gain priorities.</p>
    <p><b>Key line</b>: in a cut, trim volume a little first — don't cut weight first. Weight falling fast usually means recovery, calories, or sleep aren't enough.</p>
    <ul>
      <li><b>Don't cut protein</b>: hold <b>1.6–2.2 g/kg</b> (~140–195 g/day) — critical for muscle retention</li>
      <li><b>Rest intervals</b>: isolation can shorten slightly to save time; <b>don't cut</b> compound rest — or both volume and intensity drop</li>
      <li>Performance clearly down 2 weeks straight: proactively deload one week beats forcing load</li>
    </ul>`,
    table: [
      ['Variable', 'Bulk', 'Cut'],
      ['Load intensity', 'Steady progression', 'Hold as long as possible'],
      ['Weekly volume', 'MEV → MAV', 'MEV → lower MAV'],
      ['RIR', '1–3', '1–3; 2–4 when sleep is poor'],
      ['Cardio', 'Accessory', 'Moderate increase; avoid hurting leg recovery'],
      ['Goal', 'Muscle gain', 'Retain muscle + performance']
    ],
    cite: 'Source: Helms muscle-retention cutting framework; ISSN protein and energy deficit guidance; ACSM 2026 goal-specific training variables'
  },
  sleep: {
    html: `<p>When sleep is short, training stimulus is <b>harder to convert into muscle</b> — not "train anyway on little sleep," but a directly weaker anabolic environment.</p>
    <ul>
      <li>Research: <b>one full night without sleep</b> can drop muscle protein synthesis ~<b>18%</b>, raise cortisol ~<b>21%</b>, lower testosterone ~<b>24%</b></li>
      <li>One bad night doesn't ruin everything — <b>chronic sleep debt</b> slows recovery, worsens RIR control, drags performance down</li>
      <li>Multiple nights at 4–5 hours: strength, recovery speed, and motivation all suffer</li>
      <li><b>Target 7+ hours/night</b>; hypertrophy phase aim <b>7–9 hours</b>; high-volume blocks or pre-deload, push for 8+</li>
      <li>Consistent bedtime beats "catch-up sleep" — fixed schedule, avoid chronic 2 AM+ bedtimes</li>
      <li>After a bad night: <b>deload or cut volume</b> beats grinding heavy singles — one session can't offset chronic sleep debt</li>
    </ul>`,
    cite: 'Source: Saner et al. 2021 (acute sleep deprivation & MPS); adult sleep 7+ hour recommendation'
  },
  warmup: {
    html: `<p>Warm-up goal isn't extreme flexibility — it's getting <b>body temperature, joint range, and neural drive</b> ready to train.</p>
    <ul>
      <li><b>Low-intensity cardio 3–5 min</b>: jog, row, or bands until lightly sweating</li>
      <li><b>Dynamic mobility</b>: leg swings, arm circles, cat-cow, etc. — 3–5 moves, 5–10 reps each, general → specific</li>
      <li><b>Exercise-specific ramp</b>: <b>50%</b> working weight × 8–10 → <b>70%</b> × 4–6 → <b>85%</b> × 1–3 → working sets</li>
      <li>Avoid long <b>static stretching</b> major muscles pre-lift — can temporarily reduce strength; save stretching for post-workout or dedicated mobility</li>
      <li>Joint already irritated: drop load, adjust ROM — don't skip warm-up sets and jump to max</li>
    </ul>`,
    cite: 'Source: NSCA Foundations of Fitness Programming; dynamic warm-up review'
  },
  mesocycle: {
    html: `<p>A <b>hypertrophy block (mesocycle)</b> isn't endless loading — it's waves of "accumulate effective volume → trigger deload → supercompensate." The RP framework turns volume landmarks into a practical 4–6 week plan.</p>
    <ul>
      <li><b>Week 1</b>: start at MEV, conservative RIR (2–3), learn movements</li>
      <li><b>Weeks 2–4</b>: +1–2 effective sets/week per muscle, RIR creeps toward 1–2</li>
      <li><b>Near MRV</b>: weight won't move, recovery worse, sleep down, joints achy — time to deload (don't wait for a fixed week count)</li>
      <li><b>Deload week</b>: halve sets, drop weight 5–10%, RIR 3–4 — fatigue clears and <b>supercompensation</b> often follows</li>
      <li>Default <b>check every 4–6 weeks</b> for deload need; after 2–4 hypertrophy blocks, 1–2 weeks maintenance volume can help</li>
    </ul>`,
    cite: 'Source: RP / Israetel mesocycle; Helms 3DMJ periodization discussion'
  },
  'rep-ranges': {
    html: `<p>No single "magic rep range" for hypertrophy — <b>when trained close to failure</b>, light to heavy all build muscle. <b>6–15 reps/set</b> is the app's default <b>efficiency sweet spot</b> (not the only hypertrophy zone): good volume, moderate joint stress, pairs well with RIR logging.</p>
    <ul>
      <li>Schoenfeld meta: at failure, <b>heavy (≤7 reps) and moderate (8–15 reps) hypertrophy similar</b>; very light loads work too but need more reps and closer failure</li>
      <li><b>Compounds</b> (bench, squat, row): prefer <b>6–10 reps</b> — preserve load and total volume</li>
      <li><b>Isolation</b> (curl, lateral raise, pushdown): <b>10–15 reps</b> friendlier — less joint stress, easier RIR control</li>
      <li>Rep target changes, <b>RIR target doesn't</b> — whether 8 or 12 reps, effective sets still <b>1–3 RIR</b></li>
      <li>Within a block, <b>fix rep targets</b> per lift; progress with load or reps — avoid changing rep schemes every week</li>
    </ul>`,
    cite: 'Source: Schoenfeld et al. Sports 2021 (Repetition Continuum); JSCR 2017 load meta-analysis'
  },
  'double-progression': {
    html: `<p>Every time you log weight and reps in the app, you're doing <b>double progression</b> — fill the rep range at a weight, then add a small increment. Steadier than guessing load jumps.</p>
    <ul>
      <li>Set a <b>rep range</b> per lift: compounds <b>6–10</b>, isolation <b>10–15</b> (aligned with program targets)</li>
      <li><b>Step 1</b>: same weight, push reps toward range top (8→9→10) while keeping <b>1–2 RIR</b></li>
      <li><b>Step 2</b>: all working sets at top → next session <b>small load bump</b> (cable +5 lbs / dumbbell +2.5 lbs), reps back to range bottom</li>
      <li>NSCA <b>2-for-2 rule</b>: two sessions in a row, last set could do <b>≥2 more reps</b> → add weight — same idea as "max reps then add"</li>
      <li>Stuck same weight/reps 2–3 times: check sleep/recovery first, then <b>deload, add sets, or swap similar lift</b> — don't force load</li>
    </ul>
    <p>The progressive overload card in this app is a simplified double progression — <b>log reps clearly, then decide whether to add</b>.</p>`,
    cite: 'Source: NSCA Essentials / 2-for-2 rule; RP progressive overload framework'
  },
  'training-failure': {
    html: `<p><b>Failure (0 RIR)</b> isn't required for hypertrophy. Grgic 2022 meta: with similar total volume, <b>failure vs 1–3 reps in reserve</b> — hypertrophy difference small, but failure's <b>fatigue and recovery cost much higher</b>. Closer to failure usually helps hypertrophy signal, but fatigue rises faster.</p>
    <ul>
      <li><b>Daily working sets</b>: big compounds at <b>1–3 RIR</b> usually enough (bench, squat, deadlift)</li>
      <li><b>Occasional failure OK</b>: isolation/machine last set (curl, pushdown, leg extension) — low risk, confirms whether reps were left in tank</li>
      <li><b>Don't fail often</b>: block start, poor sleep, near MRV, or joint issues — failure amplifies accumulated fatigue</li>
      <li>Light isolation for hypertrophy: <b>must get closer to failure</b> (0–1 RIR); heavy compounds <b>1–3 RIR</b> already sufficient</li>
      <li>If RIR estimates are off: stay conservative (+1 rep), calibrate over a few sessions against reps/load</li>
    </ul>`,
    cite: 'Source: Grgic et al. Sports Medicine 2022 (proximity-to-failure meta-analysis)'
  },
  'creatine-hydration': {
    html: `<p>Beyond adequate protein, <b>creatine</b> is among the best-evidence supplements for muscle/strength; <b>hydration</b> directly affects performance and recovery — both cheap, safe, worth doing long-term.</p>
    <ul>
      <li><b>Creatine</b>: creatine monohydrate <b>3–5 g/day</b> consistently; optional load 20 g/day × 5–7 days then maintain — saturation in 3–4 weeks without loading too</li>
      <li>ISSN: <b>3 g/day × 5 years</b> still safe; modest strength/lean-mass benefit for most healthy trainees — doesn't replace training</li>
      <li><b>Hydration</b>: training days ~<b>2–3 L/day</b> (individual); 400–600 ml 2–3 hours pre-workout, sip between sets</li>
      <li>Urine <b>light yellow</b> as rough guide; post-workout or heavy sweat — add <b>electrolytes</b> (mainly sodium), not water alone</li>
      <li>Creatine may add <b>+0.5–1 kg</b> short-term (intracellular water) — not fat — fine to keep while cutting</li>
    </ul>`,
    cite: 'Source: ISSN Creatine Position Stand 2017; ISSN creatine myths review; ACSM exercise hydration guidelines'
  },
  'joint-pain': {
    html: `<p><b>Muscle burn ≠ joint pain</b> in training. Sharp/stabbing pain, worse 24h later, or form breakdown — <b>stop adding load</b> first, then decide swap vs full deload week.</p>
    <p>Log "joint discomfort" in your set log — helps tell whether it's <b>volume ramping too fast</b> or <b>exercise/load choice</b>. NSCA/ACSM: joint issues → <b>change angle, reduce load, limit ROM</b> before quitting training entirely.</p>
    <p><b>Red flags</b> (any one → pause high-intensity training and assess): night pain waking you, redness/heat/swelling, numbness or radiating pain, no improvement &gt;2 weeks, worse even at rest.</p>`,
    rules: [
      ['Situation', 'Action'],
      ['Mild discomfort, form still stable', 'Drop load 10–15%, slow eccentric'],
      ['Pain at one angle', 'Shorten ROM or change grip/stance'],
      ['Same lift hurts repeatedly', 'Swap similar lift (barbell → dumbbell/machine)'],
      ['Multiple lifts hurt, performance down', 'Early deload (halve sets, RIR 3–4)'],
      ['Redness/heat, night pain, numbness/radiating, &gt;2 weeks', 'Stop high-intensity training; medical evaluation']
    ],
    cite: 'Source: NSCA resistance training guidelines; ACSM joint and OA exercise recommendations'
  },
  'exercise-quality': {
    html: `<p>Hypertrophy isn't weight alone — <b>partials, cheat, and swing</b> pollute logs and make the app think you should add load when you should deload. ACSM 2026 lists full ROM as a key technical variable for strength adaptation.</p>
    <ul>
      <li><b>Full ROM first</b>: within joint comfort, complete range; intentional partial ROM only for rehab or specific weak points</li>
      <li><b>Loss of control or obvious cheat</b> → no load increase; set can be logged but doesn't count as effective volume</li>
      <li><b>Technique before weight</b>: when form breaks down, drop load or reps — don't force progression</li>
      <li>Isolation especially: lateral raise, curl, pushdown — no swinging reps</li>
      <li>Compounds: bench touch/control descent, consistent squat depth, row — scapula moves first then pull</li>
    </ul>`,
    cite: 'Source: ACSM 2026 resistance training position stand; NSCA movement quality standards'
  },
  'daily-readiness': {
    html: `<p>Bad sleep, stress, or joint ache — grinding the original plan anyway hurts recovery. Use this traffic light to decide: train as planned, reduce volume, or stop.</p>
    <p>Sleep &lt;6h or subjective fatigue ≥8/10 → cut sets <b>20–40%</b>, add +1 RIR.</p>`,
    table: [
      ['Status', 'Signs', "Today's adjustment"],
      ['Green', 'Sleep ≥7h, joints OK, warm-ups feel strong', 'Train as planned'],
      ['Yellow', 'Sleep 5–6h, high stress, warm-up weight feels heavy', 'Sets -20%, RIR +1'],
      ['Orange', 'Main lifts dropping reps, joints achy', 'Sets -30–50%, no load increase'],
      ['Red', 'Sharp pain, night pain, numbness/radiating', 'Stop affected lifts; light recovery or assessment']
    ],
    cite: 'Source: PMC resistance training monitoring and autoregulation review; ACSM 2026 recovery and sustainability recommendations'
  },
  'weekly-review': {
    html: `<p>Without review, the app can't tell whether to add or cut volume. Pick one fixed day/week and check these metrics — no daily obsession, but don't ignore entirely.</p>`,
    table: [
      ['Metric', 'What to watch', 'Action'],
      ['Bodyweight', '7-day average', 'Dropping too fast → add calories or cut cardio'],
      ['Measurements', 'Waist / arms / chest / legs', 'Waist down, arms stable = ideal'],
      ['Main lifts', 'Weight / reps / RIR', 'Declining streak → cut volume'],
      ['Sleep', 'Duration / bedtime', '&lt;6h often → train conservatively'],
      ['Joints', 'Pain trend', 'Persistent pain → swap exercises'],
      ['Completion rate', 'Can you finish the plan?', '&lt;80% → plan too heavy']
    ],
    cite: 'Source: RP weekly review framework; PMC training monitoring methods review'
  },
  'cardio-hypertrophy': {
    html: `<p>Concurrent cardio and lifting usually coexist, but large or high-intensity cardio can slightly interfere with fiber hypertrophy. For your goals: evening <b>brisk walking is fine</b>; if running hurts leg day performance, switch to incline walk / bike / elliptical.</p>`,
    rules: [
      ['Situation', 'Recommendation'],
      ['Brisk walk / Zone 2', 'Keep it — low recovery cost'],
      ['Running', 'Avoid too close before/after heavy leg day'],
      ['HIIT', '≤1–2 sessions/week, add cautiously'],
      ['Strength + cardio same day', 'Strength first, cardio after'],
      ['Maximize leg hypertrophy', "Don't ramp running volume too fast"]
    ],
    cite: 'Source: PMC concurrent aerobic and strength training meta-analysis; ACSM 2026 aerobic and resistance integration guidance'
  },
  'calories-carbs': {
    html: `<p>Hypertrophy/retention isn't protein alone — <b>total calories and carbs</b> drive training performance and recovery. Surplus isn't "more is better"; small surplus controls fat gain better.</p>
    <ul>
      <li><b>Bulk</b>: modest surplus (~+200–400 kcal/day), protein 1.6–2.2 g/kg unchanged</li>
      <li><b>Cut</b>: moderate deficit (~-300–500 kcal/day), prioritize protein and training performance — don't cut too aggressively</li>
      <li><b>Carbs</b>: slightly higher on training days, lower on rest; ensure carbs around big compound days — avoid long very-low-carb while forcing leg day</li>
      <li>7-day average weight dropping &gt;0.7%/week and strength falling: deficit may be too large — add calories or cut cardio</li>
      <li>Measurements (waist/arms) beat daily scale — waist down, arms stable is usually ideal cut signal</li>
    </ul>`,
    cite: 'Source: PMC energy surplus and hypertrophy review; ISSN sports nutrition position; Helms muscle-retention cutting framework'
  },
  'exercise-swaps': {
    html: `<p>When joints hurt, you need to know <b>what to swap to</b>, not just "drop weight." Run main lifts at least <b>4–6 weeks</b> before judging; isolation can rotate more freely.</p>`,
    table: [
      ['If this hurts', 'Try first'],
      ['Barbell bench shoulder discomfort', 'Dumbbell bench, machine press, Smith bench'],
      ['Straight-bar curl wrist pain', 'EZ bar, dumbbell curl, cable curl'],
      ['Squat low-back discomfort', 'Hack squat, leg press, Smith squat'],
      ['RDL low back too taxed', 'Leg curl, hip thrust, 45° back extension'],
      ['Straight-bar pushdown wrist pain', 'Rope pushdown, V-bar pushdown'],
      ['Lateral raise shoulder pinch', 'Cable lateral, machine lateral, reduced ROM']
    ],
    rules: [
      ['Reason to swap', 'Swap?'],
      ['Just bored', "Don't swap often"],
      ['Joint discomfort persisting', 'Swap'],
      ["Can't feel target muscle", 'Fix technique first, then swap'],
      ['No progress 2–3 blocks', 'OK to swap similar lift'],
      ['Equipment unavailable', 'Use swap matrix above']
    ],
    cite: 'Source: NSCA resistance training substitution principles; ACSM prescription adjustments for joint discomfort'
  },
  'exercise-order': {
    html: `<p>Exercise order affects how much you can lift and how well you move that day. ACSM 2026 lists exercise order as a prescription variable.</p>
    <p><b>Arm day example</b>: close-grip bench / dips → preacher curl → rope pushdown → hammer curl → lateral raise / face pull.</p>`,
    table: [
      ['Order', 'Exercise type'],
      ['1', 'High skill demand / main compound'],
      ['2', 'Primary hypertrophy lift'],
      ['3', 'Weak-point specialty'],
      ['4', 'Isolation volume'],
      ['5', 'Posture / core / pump work']
    ],
    cite: 'Source: ACSM 2026 resistance training position stand; NSCA exercise order review'
  },
  'tempo-control': {
    html: `<p>No need to worship 3-second eccentrics — but <b>don't swing weight</b>. Control the load, avoid momentum — foundation for safety and target-muscle stimulus.</p>
    <ul>
      <li><b>Default tempo</b>: concentric 1–2 sec, brief pause at top, eccentric 2–3 sec — control matters, don't count mechanically</li>
      <li><b>Compounds</b>: controlled eccentric is enough — don't go so slow total volume collapses</li>
      <li><b>Isolation</b>: slightly slower eccentric (2–3 sec) often hits target muscle better — curls, lateral raises, pushdowns</li>
      <li>Joint discomfort: slow eccentric, shorten ROM — safer than forcing load</li>
      <li>Must swing to finish reps → weight too heavy or fatigue too high — drop load first</li>
    </ul>`,
    cite: 'Source: NSCA eccentric training review; injury prevention technical guidelines'
  },
  'training-age-volume': {
    html: `<p>16 sets/week means different things for a beginner vs an advanced lifter. App default volume landmarks target <b>1–2 years systematic training</b> natural trainees.</p>
    <ul>
      <li><b>Beginner (&lt;1 year)</b>: start low MEV (~8–10 effective sets/week per muscle), learn movements — don't rush to high MAV</li>
      <li><b>Intermediate (1–3 years)</b>: MEV → MAV sweet spot is the main battleground; +1–2 sets/week per muscle</li>
      <li><b>Advanced (3+ years)</b>: may need higher MAV or occasional MRV touch — recovery cost higher too; sleep and deloads matter more</li>
      <li>Training age ≠ years in gym: 5 years on-and-off may still be beginner effective age</li>
      <li>Returning from long break: restart MEV, push toward MAV after 4–6 weeks</li>
    </ul>`,
    cite: 'Source: RP volume landmarks adjusted for training age; ACSM 2026 beginner vs advanced prescription differences'
  },
  'fatigue-vs-laziness': {
    html: `<p>Use <b>objective signals</b> to decide whether to force load today — not willpower alone. RPE/RIR autoregulation is standard training monitoring.</p>
    <ul>
      <li><b>Real fatigue</b>: poor sleep, main loads dropping, joint ache, same-muscle soreness not cleared, completion &lt;80%, RIR wider than usual</li>
      <li><b>Maybe just an off day</b>: warm-ups feel heavy once but sleep normal, joints OK — try -1–2 sets, don't cut everything upfront</li>
      <li><b>Laziness signals</b>: slept enough, joints OK, last week fine — just "don't feel like it" — start anyway; often improves after 2 sets</li>
      <li>Two sessions in a row can't finish plan → plan too heavy or recovery insufficient — deload or cut volume</li>
      <li>Log sleep, RIR, completion rate — after a few weeks you'll see fatigue patterns vs motivation issues</li>
    </ul>`,
    cite: 'Source: PMC resistance training monitoring and RPE/RIR autoregulation review'
  }
};
