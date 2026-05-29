// MouserCV — status slides for Bauer-lab share-out (Marina presents to the group)
// Style: white background, black text, navy accents. Narrative voice — no direct address.

const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaVideo,
  FaSearchPlus,
  FaCogs,
  FaProjectDiagram,
  FaChartBar,
} = require("react-icons/fa");

// --- Palette: 3 colours only ---
const BG    = "FFFFFF"; // background
const INK   = "111111"; // body text (true-black at 14pt+ reads heavy on screen)
const NAVY  = "1F3A6B"; // accent — titles, rules, highlights
const NAVY_DK = "13264A"; // for the dark band on the cover
const RULE  = "E5E7EB"; // very light gray for hairline separators (structural, not a colour choice)
const MUTED = "4B5563"; // dark gray for captions — kept tonal, not a 4th hue

const F_HEAD = "Georgia";
const F_BODY = "Calibri";

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
  pres.title = "MouserCV — Status & Plan";
  pres.author = "Dejan Dukic";

  const W = 13.3;
  const H = 7.5;

  // -----------------------------------------------------------
  // Icon helper — render react-icons SVG → PNG, recoloured navy or white
  // -----------------------------------------------------------
  async function iconPng(IconComponent, hexColor) {
    const svg = ReactDOMServer.renderToStaticMarkup(
      React.createElement(IconComponent, { color: "#" + hexColor, size: "256" })
    );
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    return "image/png;base64," + buf.toString("base64");
  }
  const ic = {
    video:   await iconPng(FaVideo, "FFFFFF"),
    search:  await iconPng(FaSearchPlus, "FFFFFF"),
    cogs:    await iconPng(FaCogs, "FFFFFF"),
    diagram: await iconPng(FaProjectDiagram, "FFFFFF"),
    chart:   await iconPng(FaChartBar, "FFFFFF"),
  };

  // -----------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------

  function header(slide, kicker, title) {
    // Kicker (small, navy, letter-spaced)
    slide.addText(kicker, {
      x: 0.7, y: 0.55, w: 11.9, h: 0.3,
      fontFace: F_BODY, fontSize: 10, color: NAVY,
      bold: true, charSpacing: 6, margin: 0,
    });
    // Title (Georgia, navy)
    slide.addText(title, {
      x: 0.7, y: 0.85, w: 11.9, h: 0.7,
      fontFace: F_HEAD, fontSize: 30, color: INK,
      bold: true, margin: 0,
    });
    // Hairline rule under title
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: 1.62, w: 1.0, h: 0.04,
      fill: { color: NAVY }, line: { type: "none" },
    });
  }

  function footer(slide, n, of) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.7, y: H - 0.45, w: 11.9, h: 0.01,
      fill: { color: RULE }, line: { type: "none" },
    });
    slide.addText("MouserCV  ·  status & plan  ·  May 2026", {
      x: 0.7, y: H - 0.4, w: 8, h: 0.3,
      fontFace: F_BODY, fontSize: 9, color: MUTED, margin: 0,
    });
    slide.addText(`${n} / ${of}`, {
      x: W - 1.4, y: H - 0.4, w: 0.7, h: 0.3,
      fontFace: F_BODY, fontSize: 9, color: MUTED, align: "right", margin: 0,
    });
  }

  // Text card with a thin navy left rule
  function card(slide, x, y, w, h) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h,
      fill: { color: BG }, line: { color: RULE, width: 0.75 },
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.05, h,
      fill: { color: NAVY }, line: { type: "none" },
    });
  }

  const TOTAL = 7;

  // ===========================================================
  // SLIDE 1 — Cover
  // ===========================================================
  {
    const s = pres.addSlide();
    s.background = { color: BG };

    // Navy band on the left third
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 4.2, h: H,
      fill: { color: NAVY_DK }, line: { type: "none" },
    });
    // Thin navy rule across the cover
    s.addShape(pres.shapes.RECTANGLE, {
      x: 4.2, y: H / 2 - 0.02, w: W - 4.2, h: 0.04,
      fill: { color: NAVY }, line: { type: "none" },
    });

    s.addText("MouserCV", {
      x: 0.7, y: 0.7, w: 3.5, h: 0.6,
      fontFace: F_HEAD, fontSize: 22, color: "FFFFFF", bold: true, margin: 0,
    });
    s.addText("STATUS & PLAN", {
      x: 0.7, y: 1.2, w: 3.5, h: 0.3,
      fontFace: F_BODY, fontSize: 10, color: "FFFFFF",
      charSpacing: 6, margin: 0,
    });

    s.addText("May 2026", {
      x: 0.7, y: H - 1.0, w: 3.5, h: 0.3,
      fontFace: F_BODY, fontSize: 11, color: "FFFFFF", margin: 0,
    });

    // Right side — title + subtitle
    s.addText("Computer-vision pipeline for", {
      x: 4.7, y: H / 2 - 1.6, w: W - 5.4, h: 0.45,
      fontFace: F_BODY, fontSize: 14, color: MUTED, margin: 0,
    });
    s.addText("automated mouse-behaviour scoring", {
      x: 4.7, y: H / 2 - 1.2, w: W - 5.4, h: 0.7,
      fontFace: F_HEAD, fontSize: 32, color: INK, bold: true, margin: 0,
    });
    s.addText(
      "What has been tried, what is in place today, and what is needed to validate the approach on the new top-down recordings.",
      {
        x: 4.7, y: H / 2 + 0.25, w: W - 5.4, h: 1.2,
        fontFace: F_BODY, fontSize: 13, color: INK, margin: 0,
      }
    );
    s.addText(
      "Prepared for the Bauer-lab review of the EGFR pruritus collaboration.",
      {
        x: 4.7, y: H - 0.85, w: W - 5.4, h: 0.3,
        fontFace: F_BODY, fontSize: 10, color: MUTED, italic: true, margin: 0,
      }
    );
  }

  // ===========================================================
  // SLIDE 2 — Approach & rationale
  // ===========================================================
  {
    const s = pres.addSlide();
    s.background = { color: BG };
    header(s, "01  ·  APPROACH", "Why a mask-feature pipeline");

    s.addText(
      "The objective is a scalable, label-free way to quantify scratching and grooming across cohorts, with as little manual annotation per video as possible.",
      {
        x: 0.7, y: 1.85, w: 11.9, h: 0.65,
        fontFace: F_BODY, fontSize: 14, color: INK, italic: true, margin: 0,
      }
    );

    // Three pillars
    const cardY = 2.7;
    const cardH = 3.4;
    const cardW = 3.85;
    const gap = 0.2;
    const startX = 0.7;

    const pillars = [
      {
        kicker: "SEGMENTATION",
        title: "SAM3 prompt-propagation",
        body:
          "Per-frame silhouette masks for each animal, propagated through the clip from a single prompt. Choice driven by the goal of building a classifier directly on mask geometry — keeps the pipeline label-free and avoids per-cohort retraining.",
      },
      {
        kicker: "CLASSIFICATION",
        title: "Hierarchical state machine",
        body:
          "Three-level decision on mask features (velocity → posture → behaviour) with thresholds auto-calibrated from the first 300 frames. Reliable for the geometry-distinct categories (rearing, idle); ambiguous for behaviours that share a silhouette.",
      },
      {
        kicker: "REVIEW LAYER",
        title: "Annotation web app",
        body:
          "React + FastAPI tool deployed at mousercv.dejandukic.dev. BORIS-grade keyboard workflow, in/out-point segments, per-mouse track lanes, undo/redo, autosave, CSV export. Built so a domain expert can review and correct labels quickly.",
      },
    ];

    pillars.forEach((p, i) => {
      const x = startX + i * (cardW + gap);
      card(s, x, cardY, cardW, cardH);
      s.addText(p.kicker, {
        x: x + 0.3, y: cardY + 0.3, w: cardW - 0.4, h: 0.3,
        fontFace: F_BODY, fontSize: 10, color: NAVY,
        bold: true, charSpacing: 5, margin: 0,
      });
      s.addText(p.title, {
        x: x + 0.3, y: cardY + 0.6, w: cardW - 0.4, h: 0.7,
        fontFace: F_HEAD, fontSize: 17, color: INK, bold: true, margin: 0,
      });
      s.addText(p.body, {
        x: x + 0.3, y: cardY + 1.45, w: cardW - 0.55, h: cardH - 1.55,
        fontFace: F_BODY, fontSize: 12, color: INK, margin: 0, valign: "top",
        paraSpaceAfter: 4,
      });
    });

    footer(s, 2, TOTAL);
  }

  // ===========================================================
  // SLIDE 3 — What was tried on the front-angle / diagonal videos
  // ===========================================================
  {
    const s = pres.addSlide();
    s.background = { color: BG };
    header(s, "02  ·  WHAT WAS TRIED", "Front-angle recordings: where the approach hit a wall");

    // Narrative paragraph
    s.addText(
      "The pipeline was first run end-to-end on the original diagonal / front-angle cohort (Cage 17082, Cage 2, DOB 160810, RJ193/RJ191). SAM3 produced clean per-frame masks, and the state machine handled rearing and idle well. The blocker emerged upstream of behaviour classification.",
      {
        x: 0.7, y: 1.85, w: 11.9, h: 1.0,
        fontFace: F_BODY, fontSize: 13, color: INK, margin: 0,
      }
    );

    // Two columns: blocker / consequence
    const colY = 3.1;
    const colH = 3.55;
    const colW = 5.85;
    const colGap = 0.4;

    // Col 1
    card(s, 0.7, colY, colW, colH);
    s.addText("THE BLOCKER", {
      x: 0.95, y: colY + 0.3, w: colW - 0.4, h: 0.3,
      fontFace: F_BODY, fontSize: 10, color: NAVY,
      bold: true, charSpacing: 5, margin: 0,
    });
    s.addText("Identity tracking broke down under occlusion", {
      x: 0.95, y: colY + 0.6, w: colW - 0.4, h: 0.6,
      fontFace: F_HEAD, fontSize: 17, color: INK, bold: true, margin: 0,
    });
    s.addText(
      "From the diagonal viewpoint, animals overlapped and occluded one another frequently — especially in the WT scenes with multiple mice in close contact. Reassignment errors cascaded: once two masks merged or swapped, downstream features became unreliable for the rest of the bout.",
      {
        x: 0.95, y: colY + 1.35, w: colW - 0.55, h: colH - 1.5,
        fontFace: F_BODY, fontSize: 12, color: INK, margin: 0, valign: "top",
      }
    );

    // Col 2
    const c2x = 0.7 + colW + colGap;
    card(s, c2x, colY, colW, colH);
    s.addText("THE CONSEQUENCE", {
      x: c2x + 0.25, y: colY + 0.3, w: colW - 0.4, h: 0.3,
      fontFace: F_BODY, fontSize: 10, color: NAVY,
      bold: true, charSpacing: 5, margin: 0,
    });
    s.addText("Cannot evaluate the mask-feature classifier", {
      x: c2x + 0.25, y: colY + 0.6, w: colW - 0.4, h: 0.6,
      fontFace: F_HEAD, fontSize: 17, color: INK, bold: true, margin: 0,
    });
    s.addText(
      "Without a stable per-animal mask through a full bout, the question we actually want to answer — can mask geometry alone separate scratching from grooming — cannot be tested cleanly. Tracking failure, not the classifier itself, was the limiting factor on this footage.",
      {
        x: c2x + 0.25, y: colY + 1.35, w: colW - 0.55, h: colH - 1.5,
        fontFace: F_BODY, fontSize: 12, color: INK, margin: 0, valign: "top",
      }
    );

    footer(s, 3, TOTAL);
  }

  // ===========================================================
  // SLIDE 4 — Pipeline architecture (visual stack)
  // ===========================================================
  {
    const s = pres.addSlide();
    s.background = { color: BG };
    header(s, "ARCHITECTURE  ·  END-TO-END", "From raw video to reviewable behaviour timeline");

    s.addText(
      "Five stages, each a discrete service. Outputs of one stage become the input contract of the next, so any single layer can be swapped (e.g. classifier from rules to RF) without touching the rest.",
      {
        x: 0.7, y: 1.85, w: 11.9, h: 0.7,
        fontFace: F_BODY, fontSize: 13, color: INK, italic: true, margin: 0,
      }
    );

    const layers = [
      {
        icon: ic.video,
        label: "INGEST",
        title: "Video upload & storage",
        desc: "GCS upload  ·  signed-URL streaming  ·  per-cohort foldering",
      },
      {
        icon: ic.search,
        label: "VISION",
        title: "SAM3 prompt-propagation tracking",
        desc: "Per-mouse silhouette mask + centroid trajectory, propagated from a single prompt",
      },
      {
        icon: ic.cogs,
        label: "FEATURES",
        title: "Mask geometry & motion",
        desc: "Area  ·  aspect ratio  ·  convexity  ·  velocity  ·  oscillation spectrum",
      },
      {
        icon: ic.diagram,
        label: "CLASSIFY",
        title: "Hierarchical state machine",
        desc: "Velocity → posture → behaviour, with temporal smoothing into segments",
      },
      {
        icon: ic.chart,
        label: "REVIEW",
        title: "Annotation web app",
        desc: "Timeline lanes  ·  hotkey labelling  ·  in/out points  ·  CSV export",
      },
    ];

    const rowX = 0.7;
    const rowW = 11.9;
    const rowH = 0.78;
    const rowGap = 0.10;
    let ry = 2.75;

    layers.forEach((L, i) => {
      // Row card
      s.addShape(pres.shapes.RECTANGLE, {
        x: rowX, y: ry, w: rowW, h: rowH,
        fill: { color: BG }, line: { color: RULE, width: 0.75 },
      });
      // Navy icon disc
      s.addShape(pres.shapes.OVAL, {
        x: rowX + 0.18, y: ry + 0.12, w: 0.55, h: 0.55,
        fill: { color: NAVY }, line: { type: "none" },
      });
      s.addImage({
        data: L.icon,
        x: rowX + 0.265, y: ry + 0.205, w: 0.36, h: 0.36,
      });
      // Label (kicker)
      s.addText(L.label, {
        x: rowX + 0.95, y: ry + 0.1, w: 1.6, h: 0.3,
        fontFace: F_BODY, fontSize: 10, color: NAVY,
        bold: true, charSpacing: 5, margin: 0,
      });
      // Title
      s.addText(L.title, {
        x: rowX + 2.6, y: ry + 0.08, w: 4.4, h: 0.32,
        fontFace: F_HEAD, fontSize: 14, color: INK, bold: true, margin: 0,
      });
      // Description
      s.addText(L.desc, {
        x: rowX + 0.95, y: ry + 0.42, w: rowW - 1.1, h: 0.32,
        fontFace: F_BODY, fontSize: 11.5, color: MUTED, margin: 0,
      });

      // Connector tick between rows
      if (i < layers.length - 1) {
        s.addShape(pres.shapes.RECTANGLE, {
          x: rowX + 0.44, y: ry + rowH, w: 0.04, h: rowGap,
          fill: { color: NAVY }, line: { type: "none" },
        });
      }
      ry += rowH + rowGap;
    });

    footer(s, 4, TOTAL);
  }

  // ===========================================================
  // SLIDE 5 — Annotation tool screenshot
  // ===========================================================
  {
    const s = pres.addSlide();
    s.background = { color: BG };
    header(s, "REVIEW LAYER  ·  IN PRACTICE", "Annotation tool — populated state");

    // Subtitle / context line
    s.addText(
      "The review surface a domain expert lands on. Track lanes on the right, behaviour chips with hotkeys, segment list sorted by start frame, and the export hook in the top bar.",
      {
        x: 0.7, y: 1.85, w: 11.9, h: 0.55,
        fontFace: F_BODY, fontSize: 12, color: INK, italic: true, margin: 0,
      }
    );

    // Screenshot frame (navy hairline + dark ring to set off the dark UI on white BG)
    const imgX = 0.7;
    const imgY = 2.55;
    const imgW = 8.6;
    const imgH = 4.3;

    s.addShape(pres.shapes.RECTANGLE, {
      x: imgX - 0.05, y: imgY - 0.05, w: imgW + 0.1, h: imgH + 0.1,
      fill: { color: NAVY }, line: { type: "none" },
    });
    s.addImage({
      path: "frontend-screenshot.png",
      x: imgX, y: imgY, w: imgW, h: imgH,
    });

    // Side annotations (right-hand callouts, navy left-rule cards)
    const callX = imgX + imgW + 0.4;
    const callW = W - callX - 0.7;
    const calls = [
      { kicker: "TRACK LANES", body: "Per-mouse colour-coded lanes; identity stable across the clip from SAM3 propagation." },
      { kicker: "HOTKEYS", body: "Seven behaviours mapped 1–7. In-point I, out-point O. Undo / redo, autosave to localStorage." },
      { kicker: "SEGMENT LIST", body: "Default tab. Click a row to seek, hover to delete. Live count visible in the tab title." },
      { kicker: "EXPORT", body: "CSV download with track labels, frame ranges, durations, notes — drops straight into downstream analysis." },
    ];

    let cy = imgY;
    const ch = (imgH - 0.3) / calls.length;
    calls.forEach((c, i) => {
      // Card
      s.addShape(pres.shapes.RECTANGLE, {
        x: callX, y: cy, w: callW, h: ch - 0.1,
        fill: { color: BG }, line: { color: RULE, width: 0.75 },
      });
      // Navy left rule
      s.addShape(pres.shapes.RECTANGLE, {
        x: callX, y: cy, w: 0.05, h: ch - 0.1,
        fill: { color: NAVY }, line: { type: "none" },
      });
      s.addText(c.kicker, {
        x: callX + 0.2, y: cy + 0.12, w: callW - 0.3, h: 0.25,
        fontFace: F_BODY, fontSize: 9, color: NAVY,
        bold: true, charSpacing: 5, margin: 0,
      });
      s.addText(c.body, {
        x: callX + 0.2, y: cy + 0.38, w: callW - 0.3, h: ch - 0.5,
        fontFace: F_BODY, fontSize: 11, color: INK, margin: 0, valign: "top",
      });
      cy += ch;
    });

    footer(s, 5, TOTAL);
  }

  // ===========================================================
  // SLIDE 6 — Top-down pivot: what changed, what is still open
  // ===========================================================
  {
    const s = pres.addSlide();
    s.background = { color: BG };
    header(s, "03  ·  WHERE WE ARE NOW", "Top-down pivot: tracking solved, questions opened");

    s.addText(
      "The collaboration moved to a top-down camera. Initial inspection on the available recording confirms that the tracking failure mode is gone — but the change of perspective re-opens the question of how each behaviour appears, and whether a single video is enough to draw conclusions.",
      {
        x: 0.7, y: 1.85, w: 11.9, h: 0.95,
        fontFace: F_BODY, fontSize: 13, color: INK, margin: 0,
      }
    );

    // 2x2 grid of observations
    const items = [
      {
        kicker: "RESOLVED",
        title: "Animal reassignment no longer an issue",
        body:
          "From above, mice rarely occlude one another for long. SAM3 holds identity through the clip; the multi-WT failure mode does not appear in the top-down footage.",
      },
      {
        kicker: "CHANGED",
        title: "Silhouette geometry is different",
        body:
          "Postures that were distinctive from the side (rearing, hind-limb scratch) project differently from above. Existing thresholds calibrated on diagonal video do not transfer; the mask-feature set itself needs to be re-characterised.",
      },
      {
        kicker: "SAMPLE LIMITATION",
        title: "Only one top-down video on hand",
        body:
          "Scratching is not prominent in this single clip, so the most behaviourally interesting category cannot yet be evaluated. A larger set of recordings — ideally enriched for scratching bouts — is the immediate gating need.",
      },
      {
        kicker: "OPEN QUESTION",
        title: "Mask-only discrimination — feasibility unknown",
        body:
          "Whether mask features alone can separate scratching from grooming top-down is an open question, not a settled one. It cannot be answered without (a) more footage and (b) a small ground-truth set to calibrate against.",
      },
    ];

    const gx0 = 0.7;
    const gy0 = 3.0;
    const gw = 6.05;
    const gh = 1.85;
    const ggap = 0.2;

    items.forEach((it, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = gx0 + col * (gw + ggap);
      const y = gy0 + row * (gh + ggap);

      card(s, x, y, gw, gh);
      s.addText(it.kicker, {
        x: x + 0.25, y: y + 0.18, w: gw - 0.4, h: 0.28,
        fontFace: F_BODY, fontSize: 10, color: NAVY,
        bold: true, charSpacing: 5, margin: 0,
      });
      s.addText(it.title, {
        x: x + 0.25, y: y + 0.45, w: gw - 0.4, h: 0.45,
        fontFace: F_HEAD, fontSize: 15, color: INK, bold: true, margin: 0,
      });
      s.addText(it.body, {
        x: x + 0.25, y: y + 0.95, w: gw - 0.45, h: gh - 1.05,
        fontFace: F_BODY, fontSize: 11.5, color: INK, margin: 0, valign: "top",
      });
    });

    footer(s, 6, TOTAL);
  }

  // ===========================================================
  // SLIDE 7 — Path forward
  // ===========================================================
  {
    const s = pres.addSlide();
    s.background = { color: BG };
    header(s, "04  ·  PATH FORWARD", "What unblocks the rest of the pipeline");

    s.addText(
      "The next steps are sequenced so that each one reduces a specific uncertainty and feeds the next. The label-free goal is preserved as the design target; whether it is achievable will be determined by the ground-truth calibration set.",
      {
        x: 0.7, y: 1.85, w: 11.9, h: 0.85,
        fontFace: F_BODY, fontSize: 13, color: INK, italic: true, margin: 0,
      }
    );

    const steps = [
      {
        n: "01",
        title: "Collect more top-down recordings",
        body:
          "Priority on clips with clear scratching activity. Until the set is broader, no statement about top-down scratch detection can be supported by data.",
      },
      {
        n: "02",
        title: "Build a small golden-standard set",
        body:
          "A few videos densely annotated by the domain expert — scratch, groom, hypergroom, head shake. This is what every later decision (feature choice, classifier shape, threshold tuning) will be calibrated against.",
      },
      {
        n: "03",
        title: "Validate DLC SuperAnimal keypoints top-down",
        body:
          "Run zero-shot pose estimation (top-view-mouse model) on the new footage and check per-keypoint confidence. Keypoints are the natural fallback signal if mask features turn out to be insufficient on their own.",
      },
      {
        n: "04",
        title: "Decide classifier form against the golden set",
        body:
          "With ground-truth in hand, test: (a) mask features alone, (b) mask + selected keypoints, (c) a learned model. Keep the simplest form that meets accuracy on the calibration set; remain label-free wherever feasible.",
      },
    ];

    const sx0 = 0.7;
    const sy0 = 2.85;
    const sw = 6.05;
    const sh = 1.7;
    const sgap = 0.2;

    steps.forEach((p, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = sx0 + col * (sw + sgap);
      const y = sy0 + row * (sh + sgap);

      card(s, x, y, sw, sh);
      // Big numeral
      s.addText(p.n, {
        x: x + 0.25, y: y + 0.2, w: 1.0, h: 1.0,
        fontFace: F_HEAD, fontSize: 38, color: NAVY, bold: true, margin: 0,
      });
      s.addText(p.title, {
        x: x + 1.3, y: y + 0.25, w: sw - 1.5, h: 0.6,
        fontFace: F_HEAD, fontSize: 16, color: INK, bold: true, margin: 0,
      });
      s.addText(p.body, {
        x: x + 1.3, y: y + 0.85, w: sw - 1.5, h: sh - 0.95,
        fontFace: F_BODY, fontSize: 11.5, color: INK, margin: 0, valign: "top",
      });
    });

    // Closing line — narrative, no direct address
    s.addText(
      "The annotation tool is ready to support this loop today; the bottleneck is footage and ground-truth, not infrastructure.",
      {
        x: 0.7, y: 6.6, w: 11.9, h: 0.35,
        fontFace: F_BODY, fontSize: 12, color: NAVY,
        bold: true, italic: true, margin: 0, align: "center",
      }
    );

    footer(s, 7, TOTAL);
  }

  await pres.writeFile({ fileName: "MouserCV-status-2026-05-02.pptx" });
  console.log("wrote MouserCV-status-2026-05-02.pptx");
})();
