module.exports = {
  src_folders: ['e2e'],
  output_folder: './integration-tests-report/',

  test_runner: {
    type: 'cucumber',
    options: {
      feature_path: 'e2e/features',
      require: ['e2e/step_definitions'],
      tags: 'not @skip',
      format: [
        'html:./integration-tests-report/cucumber-report.html',
        'json:./integration-tests-report/cucumber-report.json',
        'junit:./integration-tests-report/cucumber-junit.xml',
      ],
    },
  },

  globals_path: '',

  test_workers: {
    enabled: false,
  },

  test_settings: {
    default: {
      disable_error_log: false,
      launch_url: 'http://localhost:8080',

      screenshots: {
        enabled: true,
        path: 'integration-tests-report/screenshots',
        on_failure: true,
        on_skip: false,
      },

      desiredCapabilities: {
        browserName: 'chrome',
      },

      webdriver: {
        start_process: true,
        server_path: '',
      },
    },

    chrome: {
      desiredCapabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--ignore-certificate-errors',
            '--allow-insecure-localhost',
            '--headless=new',
            '--window-size=1280,1024',
          ],
        },
      },

      webdriver: {
        start_process: true,
        server_path: '',
      },
    },
  },
};
