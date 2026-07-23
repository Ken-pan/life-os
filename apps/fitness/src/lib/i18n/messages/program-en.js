/** English program & training-day labels */
export default {
  "programs": {
    "bro-split": {
      "name": "Chest · Back · Legs · Arms rotation",
      "shortName": "4-day split",
      "goalLabel": "Arm size · upper-body focus",
      "description": "Arm-size priority: chest → back → legs → arms. Leg day buffers before arms and never follows back. Core lifts stay daily; dips/curls can be added from the pool.",
      "source": "Korben Training custom · 12–18 direct arm sets/week · RIR 1–2",
      "level": "Intermediate",
      "tags": [
        "Default",
        "Arm focus",
        "Upper priority"
      ]
    },
    "upper-lower-4": {
      "name": "Upper / lower 4-day · upper priority",
      "shortName": "Upper/Lower 4",
      "goalLabel": "Muscle retention · upper size",
      "description": "Each muscle ~2×/week; two upper days slightly higher volume, two lower days one heavy one light. Balanced for cuts.",
      "source": "Schoenfeld meta-analysis · classic 4-day UL split",
      "level": "Intermediate",
      "tags": [
        "Recommended",
        "Cut-friendly",
        "2× frequency"
      ]
    },
    "ppl-6": {
      "name": "Push / pull / legs 6-day · classic PPL",
      "shortName": "PPL 6-day",
      "goalLabel": "High upper frequency · max size",
      "description": "PPL twice per week — high upper frequency. Large total volume; best in surplus; watch sleep on cuts.",
      "source": "Reddit PPL lineage · ~10–20 sets/muscle/week",
      "level": "Intermediate+",
      "tags": [
        "High frequency",
        "Upper",
        "High volume"
      ]
    },
    "fullbody-3": {
      "name": "Full body 3-day · maintain on cut",
      "shortName": "Full body 3",
      "goalLabel": "Maintain muscle · time efficient",
      "description": "One push, pull, and leg compound each session plus arm work. Short sessions, fast recovery — busy weeks or early cut.",
      "source": "ACSM ≥2×/week resistance · 3× full-body effective at matched volume",
      "level": "Beginner–intermediate",
      "tags": [
        "Cut",
        "Time-saving",
        "Fast recovery"
      ]
    }
  },
  "days": {
    "chest": {
      "cn": "Chest",
      "subtitle": "Chest · front delts · triceps",
      "label": "Push",
      "note": "Compound-first with controlled eccentrics; prioritize incline work for upper chest. Triceps volume lives on arm day — no dips by default on chest day.",
      "vol": "Chest ~12 direct sets · easy on triceps",
      "warmup": [
        {
          "name": "Band chest expansion",
          "note": "Activate chest + rotator cuff"
        },
        {
          "name": "Empty bar / light bench",
          "note": "Groove the bar path"
        }
      ]
    },
    "back": {
      "cn": "Back",
      "subtitle": "Width · thickness · posture (rear delts / erectors)",
      "label": "Pull",
      "note": "Prioritize lat width and mid-back thickness; avoid pre-fatiguing biceps. Straps are fine on heavy pulls so grip is not the limiter.",
      "vol": "Lats / mid-back ~13 sets + rear delts / erectors ~6 · no curls",
      "warmup": [
        {
          "name": "Lat pulldown (light)",
          "note": "Activate lats"
        },
        {
          "name": "Face pull (light)",
          "note": "Rear delts / rotator cuff"
        }
      ]
    },
    "arms": {
      "cn": "Arms",
      "subtitle": "Biceps · triceps · arm size focus",
      "label": "Arms",
      "note": "Arm specialization: close-grip press and curls first, overhead extensions for long-head triceps, isolations for pump. RIR 1–2; last isolation set can hit 0–1.",
      "vol": "Biceps ~8 sets · triceps ~8 sets · direct volume controlled",
      "warmup": [
        {
          "name": "Cable curl (light)",
          "note": "Activate biceps"
        },
        {
          "name": "Cable pushdown (light)",
          "note": "Activate triceps"
        }
      ]
    },
    "legs": {
      "cn": "Legs",
      "subtitle": "Quads · hamstrings · glutes",
      "label": "Legs",
      "note": "Squat depth and safety first; leg day also buffers before arm day. Leg press and hack squat can go heavier when base is solid.",
      "vol": "Quads ~10 · hams/glutes ~9 · calves 4 sets",
      "warmup": [
        {
          "name": "Bodyweight squat",
          "note": "Hip–knee–ankle prep"
        },
        {
          "name": "Leg curl (light)",
          "note": "Activate hamstrings"
        }
      ]
    },
    "core": {
      "cn": "Core",
      "subtitle": "Rectus · obliques · stability",
      "label": "Core",
      "note": "Abs recover fast. Default: finish after legs and arms (2×/week; add chest for a 3rd). Skip after back — next day is legs and you need a fresh brace for squats. Quality reps: exhale and squeeze, slow eccentrics, no momentum.",
      "vol": "Core ~16 sets · after legs + arms · 2×/week",
      "warmup": [
        {
          "name": "Dead bug",
          "note": "Deep core activation"
        },
        {
          "name": "Glute bridge",
          "note": "Wake posterior chain"
        }
      ]
    },
    "delts": {
      "cn": "Delts",
      "subtitle": "Pumpkin delts · side cap · rear roundness",
      "label": "Shoulders",
      "note": "Target ~12–16 hard sets/week each for side and rear, split across 2 sessions (Schoenfeld). Front delts covered by pressing. Default pairing: after chest (laterals while warm) and after legs (fresh upper body, spaced from chest by back day so rear delts recover; back-day face pulls stay separate). 12–20 reps, RIR 0–1, 2–3s eccentrics.",
      "vol": "~7 side + ~7 rear / session · after chest + legs · 2×/week",
      "warmup": [
        {
          "name": "Shoulder circles",
          "note": "Rotator cuff, small ROM"
        },
        {
          "name": "Face pull (light)",
          "note": "ER / scap prep (not main hypertrophy)"
        }
      ]
    },
    "office": {
      "cn": "Desk reset",
      "subtitle": "Hip flexors · T-spine · rotator cuff · core",
      "label": "Recovery",
      "note": "For long desk days or evening wind-down. Slow breathing, no bouncing — tension not pain. 2–3×/week.",
      "vol": "Mobility ~20 min",
      "warmup": [
        {
          "name": "Cat–cow",
          "note": "Spinal mobility"
        },
        {
          "name": "Band pull-apart",
          "note": "Rear delts / scapular control"
        }
      ]
    },
    "morning": {
      "cn": "Morning prep",
      "subtitle": "Flow · joint prep · light cardio",
      "label": "Activation",
      "note": "Short morning flow — joint prep and light movement before the day.",
      "vol": "Flow ~15 min",
      "warmup": [
        {
          "name": "World's greatest stretch",
          "note": "Full-body flow"
        }
      ]
    },
    "upper_a": {
      "cn": "Upper A",
      "subtitle": "Push · chest/shoulders/triceps priority",
      "label": "Upper",
      "note": "Upper body A — pressing emphasis with supporting pulls.",
      "vol": "Upper ~14–18 sets",
      "warmup": [
        {
          "name": "Band pull-apart",
          "note": "Scapular prep"
        },
        {
          "name": "Light push-up",
          "note": "Shoulder warm-up"
        }
      ]
    },
    "lower_a": {
      "cn": "Lower A",
      "subtitle": "Quads · hams · glutes · main intensity",
      "label": "Lower",
      "note": "Primary lower day — heavier compounds.",
      "vol": "Lower ~12–16 sets",
      "warmup": [
        {
          "name": "Bodyweight squat",
          "note": "Hip–knee prep"
        },
        {
          "name": "Leg curl (light)",
          "note": "Hamstring prep"
        }
      ]
    },
    "upper_b": {
      "cn": "Upper B",
      "subtitle": "Pull · back · biceps · posture",
      "label": "Upper",
      "note": "Upper body B — rowing and lat work with arm finishers.",
      "vol": "Upper ~14–18 sets",
      "warmup": [
        {
          "name": "Lat pulldown (light)",
          "note": "Lat activation"
        },
        {
          "name": "Face pull (light)",
          "note": "Rear delts"
        }
      ]
    },
    "lower_b": {
      "cn": "Lower B",
      "subtitle": "Quads · hams · glutes · moderate volume",
      "label": "Lower",
      "note": "Secondary lower day — moderate load and isolations.",
      "vol": "Lower ~10–14 sets",
      "warmup": [
        {
          "name": "Walking lunge stretch",
          "note": "Hip mobility"
        },
        {
          "name": "Leg extension (light)",
          "note": "Quad activation"
        }
      ]
    },
    "push_a": {
      "cn": "Push A",
      "subtitle": "Chest · shoulders · triceps · compounds first",
      "label": "Push",
      "note": "Push A — heavy pressing patterns.",
      "vol": "Push ~12–16 sets",
      "warmup": [
        {
          "name": "Band chest expansion",
          "note": "Chest + cuff"
        },
        {
          "name": "Empty bar bench",
          "note": "Bar path"
        }
      ]
    },
    "pull_a": {
      "cn": "Pull A",
      "subtitle": "Lat width · thickness · biceps",
      "label": "Pull",
      "note": "Pull A — vertical and horizontal pulls.",
      "vol": "Pull ~12–16 sets",
      "warmup": [
        {
          "name": "Lat pulldown (light)",
          "note": "Lats"
        },
        {
          "name": "Scap pull",
          "note": "Scapular control"
        }
      ]
    },
    "legs_a": {
      "cn": "Legs A",
      "subtitle": "Quads · hams · glutes · main day",
      "label": "Legs",
      "note": "Primary leg day — squat pattern focus.",
      "vol": "Legs ~14–18 sets",
      "warmup": [
        {
          "name": "Bodyweight squat",
          "note": "Joint prep"
        },
        {
          "name": "RDL (empty bar)",
          "note": "Hip hinge"
        }
      ]
    },
    "push_b": {
      "cn": "Push B",
      "subtitle": "Upper chest · isolation press · triceps",
      "label": "Push",
      "note": "Push B — incline and isolation emphasis.",
      "vol": "Push ~12–14 sets",
      "warmup": [
        {
          "name": "Incline DB press (light)",
          "note": "Upper chest"
        },
        {
          "name": "Triceps pushdown (light)",
          "note": "Triceps prep"
        }
      ]
    },
    "pull_b": {
      "cn": "Pull B",
      "subtitle": "Rows · rear delts · biceps",
      "label": "Pull",
      "note": "Pull B — rowing volume and rear-delt work.",
      "vol": "Pull ~12–14 sets",
      "warmup": [
        {
          "name": "Face pull (light)",
          "note": "Rear delts"
        },
        {
          "name": "Cable row (light)",
          "note": "Mid-back"
        }
      ]
    },
    "legs_b": {
      "cn": "Legs B",
      "subtitle": "Leg press · isolations · moderate",
      "label": "Legs",
      "note": "Secondary leg day — machines and isolations.",
      "vol": "Legs ~10–14 sets",
      "warmup": [
        {
          "name": "Leg press (light)",
          "note": "Quad activation"
        },
        {
          "name": "Leg curl (light)",
          "note": "Hamstrings"
        }
      ]
    },
    "full_a": {
      "cn": "Full A",
      "subtitle": "Push · pull · legs · one compound each",
      "label": "Full",
      "note": "Full body A — one push, pull, and leg pattern plus arms.",
      "vol": "Full body ~12–15 sets",
      "warmup": [
        {
          "name": "Bodyweight squat",
          "note": "Lower prep"
        },
        {
          "name": "Band row",
          "note": "Upper prep"
        }
      ]
    },
    "full_b": {
      "cn": "Full B",
      "subtitle": "Upper chest · vertical pull · leg press",
      "label": "Full",
      "note": "Full body B — variation on main patterns.",
      "vol": "Full body ~12–15 sets",
      "warmup": [
        {
          "name": "Hip circle",
          "note": "Hip mobility"
        },
        {
          "name": "Light pulldown",
          "note": "Lat prep"
        }
      ]
    },
    "full_c": {
      "cn": "Full C",
      "subtitle": "Machine press · rows · hack squat",
      "label": "Full",
      "note": "Full body C — machine-friendly full session.",
      "vol": "Full body ~12–15 sets",
      "warmup": [
        {
          "name": "Cat–cow",
          "note": "Spine"
        },
        {
          "name": "Band pull-apart",
          "note": "Shoulders"
        }
      ]
    }
  }
};
