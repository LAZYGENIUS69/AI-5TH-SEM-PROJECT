<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep irrigation calculations in pure modules under `src/algorithms`; the live sensor simulator may depend on them, but they must not depend on React, so the Algorithm Inspector stays synchronized with production logic.
- Keep light/dark theming app-wide through semantic tokens; reserve AgriDSS control-room treatments for the irrigation dashboard so every page follows the user's selected mode.
- Load TensorFlow.js only via dynamic import from src/lib/cnnModel.ts; validate labels, input shape and output probabilities, run disposable on-load self-tests and cache only successful loads. CNN label/metrics helpers stay pure in src/algorithms/cnnClassifier.ts so SSR never pulls tfjs and the Inspector reads the same constants.
- The one-click agent orchestration lives in src/algorithms/agentFlow.ts with side effects injected (forecast fetch, LLM stream) so it stays React-free and testable.
