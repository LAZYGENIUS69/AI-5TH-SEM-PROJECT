# Roadmap

- [x] Integrate the supplied AgriDSS decision engine and simulation.
- [x] Replace the irrigation screen with the decision dashboard and retained forecast plan.
- [x] Add the sensor/ML formulas to Algorithm Inspector.
- [x] Verify desktop and mobile behavior.
- [x] Apply the uploaded AgriDSS dark theme to the irrigation screen only, including its navigation and forecast plan.
- [x] Verify the dark screen on desktop and mobile without changing other pages.
- [x] Add an app-wide persistent light/dark switch with a black-heavy dark palette.
- [x] Verify both themes on desktop and mobile, including irrigation and persistence.
- [x] Rename Crop Scanner to Disease Detection in navigation, page heading and page metadata.
- [x] CNN scanner engine with heuristic fallback, model evaluation panel, one-click farm analysis agent, Inspector tabs.
- [x] Pin TensorFlow.js, validate raw inputs and model outputs, add disposable self-tests, expose timed model status/errors and retry, verify fallback scan persistence and live farm analysis; eight contract tests pass.
- [x] Audit all project folders, upload mounts, local repository HEAD and the complete latest GitHub main tree for all seven CNN files; verify URL responses and Retry behavior. Local and GitHub HEAD match; no files found.
- [x] Move the seven uploaded CNN files from the repo root into public/model/, verify every URL serves the real file, and confirm the model loads with passing zero and noise self-tests.
- [ ] Run a real leaf-photo CNN scan (no real leaf photo supplied yet).
- [ ] Verify training notebook destination. Blocked: real notebook URL is not supplied.
- [x] Typeset all algorithm/formula content with KaTeX (lazy-loaded, pinned 0.19.1): SPEC formulas now carry latex + symbol legends, Inspector tabs use steppers/formula cards/limitation callouts, fertilizer pH table, dashboard inline math; verified light/dark at 1280 and 390 with no overflow or console errors.
