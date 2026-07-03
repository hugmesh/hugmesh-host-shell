module.exports = {
  src_folders: ['e2e'],
  output_folder: './integration-tests-report/',

  test_runner: {
    type: 'cucumber',
    options: {
      feature_path: 'e2e/features',
      require: ['e2e/step_definitions'],
      // @skip is the existing manual skip. @cluster marks scenarios that need
      // the integrated env (the federation REMOTES served from their own dev
      // servers / nginx — manifest ports 4203-4206) to render remote CONTENT; the
      // default host-only run cannot serve those, so they are excluded here and
      // run explicitly with `npm run e2e:integration` (`--tag cluster`).
      // @cluster is the platform-wide convention for live-stack-only scenarios
      // (mirrors admin/mod/mastodon/matrix/user/wiki/tube/owncast-ui's
      // playwright-bdd `not @cluster` filter) — this repo previously used
      // @integration; the tag was renamed, semantics unchanged.
      tags: 'not @skip and not @cluster',
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

    nginx: {
      launch_url: 'http://localhost:8081',

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
