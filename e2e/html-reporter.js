var fs = require("fs");
var path = require("path");
var handlebars = require("handlebars");

module.exports = {
  write: function (results, options, done) {
    var reportFilename =
      options.filename_prefix + Math.floor(Date.now() / 1000) + ".html";
    var reportFilePath = path.join(
      __dirname,
      options.output_folder,
      reportFilename,
    );

    // The output folder is generated build output — create it so the write
    // below cannot ENOENT on a clean checkout (it did: the reporter was the one
    // "error during execution" on every fresh `npm run e2e`).
    fs.mkdirSync(path.dirname(reportFilePath), { recursive: true });

    // read the html template
    fs.readFile("e2e/html-reporter.hbs", function (err, data) {
      if (err) throw err;

      var template = data.toString();

      // merge the template with the test results data
      var html = handlebars.compile(template)({
        results: results,
        options: options,
        timestamp: new Date().toString(),
        browser: options.filename_prefix.split("_").join(" "),
        totalTests: results.passed + results.failed + results.errors,
      });

      // write the html to a file
      fs.writeFile(reportFilePath, html, function (err) {
        if (err) throw err;
        console.log("Report generated: " + reportFilePath);
        done();
      });
    });
  },
};
