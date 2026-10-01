# Integrate AgriDSS irrigation into AgriSense

## What changes
- Replace the current irrigation planner screen with the uploaded AgriDSS decision-support dashboard.
- Preserve the supplied weighted sensor fusion, normalization, six-reading smoothing, Hargreaves ET₀/ETc, KNN k=5, Naive Bayes fallback, decision gates, drought/rain/fault scenarios, pump state, tank level, logs, and model comparison.
- Keep the working 7-day weather schedule available below the live decision system so AgriSense retains forecast planning.
- Restyle every panel, chart, control, status, and animation using AgriSense’s existing warm light theme and semantic colors.
- Make the dense dashboard stack cleanly on phones and tablets.
- Expose the added sensor/ML formulas in the existing Algorithm Inspector.

## Technical details
- Adapt the uploaded Next.js/Socket.IO code to the project’s TanStack Start structure and browser-safe simulation; unsupported custom-server code will not be copied.
- Add a pure irrigation decision engine and a simulation hook, then compose focused irrigation dashboard panels in the existing `/irrigation` page.
- Keep the existing farm crop selection synchronized where the uploaded model supports wheat, rice, and maize.
- Verify compilation and exercise controls, scenarios, charts, and mobile layout in the running preview.
