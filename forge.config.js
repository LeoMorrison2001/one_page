const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const fs = require('node:fs');
const path = require('node:path');
const packageJson = require('./package.json');

const releaseFilePrefix = `one-page-${packageJson.version}-windows-x64`;

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: '一页',
    icon: './assets/app-icon.ico',
    extraResource: ['./assets/app-icon.png'],
    electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: './assets/app-icon.ico',
        setupExe: `${releaseFilePrefix}-setup.exe`,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'LeoMorrison2001', name: 'one_page' },
        // Keep a release as a draft while assets upload; GitHub Actions fills
        // in the Chinese title and notes, then publishes it.
        force: true,
      },
    },
  ],
  hooks: {
    postMake: async (_config, makeResults) => makeResults.map((result) => ({
      ...result,
      artifacts: result.artifacts.map((artifactPath) => {
        if (result.platform !== 'win32' || !artifactPath.endsWith('.zip')) return artifactPath;
        const portablePath = path.join(path.dirname(artifactPath), `${releaseFilePrefix}-portable.zip`);
        fs.renameSync(artifactPath, portablePath);
        return portablePath;
      }),
    })),
  },
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
