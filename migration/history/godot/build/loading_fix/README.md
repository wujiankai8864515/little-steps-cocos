# COMIC → HOME loading repair

## What is proven

The reported browser had initialized official Godot 4.5.2 / WebGL2 and reached LOGIN and COMIC. The displayed error is ComicPage.set_home_error, called only after App home preparation returns HOME_PACK_FAILED, HOME_RESOURCE_FAILED, or HOME_SCENE_FAILED. The old code discards the underlying reason instead of printing it; this report does not claim the user's particular failure code was observed.

The shipped embedded manifest has no limits override. PackService's 30-second deadline begins when a pack is enqueued, including time waiting for its dependencies and a concurrency slot. Home requires exterior (1,107,208 B), travel (22,912,472 B), then house (11,678,904 B). The browser host allows 120 seconds for an actual transfer. These mismatched clocks can cancel a healthy dependency chain.

A deterministic official-engine regression demonstrates travel taking 20 seconds followed by house taking 20 seconds: the original implementation fails; the repaired implementation succeeds. Each transfer is individually below the original 30-second limit. The exact original seven packs also pass real dynamic mounting through the App with an injected native filesystem transport, without pre-mounting all deferred packs. This rules out a demonstrated missing cross-pack resource in that tested native path, but is not a real-browser rendering result.

## Repair

- Start each deadline when its transport attempt starts, not while waiting on dependencies.
- Web default deadline is 130 seconds, allowing the host's bounded 120-second download to report its failure.
- A timed-out attempt gets the already configured one retry; each attempt has its own full bounded time budget. Two stalled attempts fail and release the waiter.
- Keep cancellation and stale-callback protection.
- Print HOME_PREPARATION_FAILED with precise pack/resource metrics. Preserve the diagnostic in startup_metrics.last_home_failure and, on Web, window.travelLastHomeFailureJSON.

No game art, scenes, resource grouping, progression, or three-component source structure was replaced. No website was deployed by this repair task.

## Verification

The deterministic test includes dependency waiting, timeout retry, fresh retry budget, permanent stall termination, cancellation/stale callbacks, and the Web timeout contract. The original failing regression and repaired output are retained here. Run build/checks/test_pack_deadlines.gd against an assembled project using the official 4.5.2 engine.

The full production assemble --packs checks parsing, resource references, scene construction, production input, the LOADING→LOGIN→COMIC→HOME App smoke flow, official script/scene export, seven pack construction, packed scene construction, and resource inventory.

Real WebGL2 browser gameplay remains a separate acceptance gate. A synthetic clock test and native dynamic PCK test do not certify browser rendering, memory, network conditions, audio, or persistent storage. The user's exact observed root cause remains unconfirmed until its failure details are available.
