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
    browsers: ["Chrome", "ChromeHeadless", "ChromeHeadlessCI"],
    customLaunchers: {
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
