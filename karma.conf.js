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
      outputDir: require("path").join(__dirname, "./coverage/snapdragon/"),
      outputFile: "test-results.xml",
      useBrowserName: false,
    },
    coverageReporter: {
      dir: "coverage/snapdragon",
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
        flags: ["--no-sandbox", "--disable-dev-shm-usage"],
      },
    },
    singleRun: true,
    restartOnFileChange: true,
  });
};
