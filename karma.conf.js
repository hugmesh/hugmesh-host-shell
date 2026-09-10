module.exports = function (config) {
  config.set({
    basePath: "",
    frameworks: ["jasmine", "@angular-devkit/build-angular"],
    plugins: [
      require("karma-jasmine"),
      require("karma-chrome-launcher"),
      require("karma-junit-reporter"),
      require("karma-coverage"),
      require("@angular-devkit/build-angular/plugins/karma"),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    junitReporter: {
      outputDir: require("path").join(__dirname, "./coverage/hugmesh/"),
      outputFile: "test-results.xml",
      useBrowserName: false,
    },
    coverageReporter: {
      dir: "coverage/hugmesh",
      reporters: [
        { type: "html",         subdir: "html"                               },
        { type: "lcovonly",     subdir: ".",   file: "lcov.info"             },
        { type: "json-summary", subdir: ".",   file: "coverage-summary.json" },
        { type: "text-summary"                                               },
      ],
    },
    reporters: ["progress", "junit", "coverage"],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    // Every launcher named here MUST carry a >= 992px --window-size. See the
    // ChromeHeadlessCI comment below for why that is load-bearing, and
    // scripts/check-karma-viewport.mjs for the guard that enforces it.
    //
    // This used to read ["Chrome", "ChromeHeadless", "ChromeHeadlessCI"]. Only
    // the third had the window size, so `npm test` — the command in this repo's
    // own package.json — ran the suite three times and went RED on 7
    // desktop-layout specs, every time, on a perfectly healthy tree. CI never
    // saw it because `npm run coverage` passes --browsers=ChromeHeadlessCI and
    // bypasses this list entirely. A suite that is green in CI and red on every
    // developer's machine teaches people to ignore it.
    browsers: ["ChromeHeadlessCI"],
    customLaunchers: {
      // Headed, for local debugging: `npm test -- --browsers=ChromeDebugCI`.
      // Same window size as the headless one, because a layout spec that passes
      // headless and fails headed (or the reverse) is worse than useless.
      ChromeDebugCI: {
        base: "Chrome",
        flags: ["--window-size=1600,1200"],
      },
      ChromeHeadlessCI: {
        base: "ChromeHeadless",
        // --window-size is LOAD-BEARING, not cosmetic. Karma renders the specs
        // inside an iframe that is width:100% of the browser window, so the
        // window size IS the viewport every media query is evaluated against.
        // Headless Chrome defaults to 800x600 (≈765px inside the iframe), which
        // is BELOW bootstrap's lg breakpoint (992px) — so every `.navbar-expand-lg`
        // rule that only applies on desktop was invisible to the suite, and a
        // desktop-only layout regression could not be caught here at all.
        // 1600x1200 puts the suite on the desktop side of every bootstrap
        // breakpoint; layout specs that need a narrow viewport must assert their
        // own width rather than assume the default.
        flags: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1600,1200"],
      },
    },
    singleRun: true,
    restartOnFileChange: true,
  });
};
