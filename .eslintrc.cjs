module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react/jsx-runtime'],
  settings: { react: { version: '18' } },
  globals: {
    VideoEncoder: 'readonly',
    VideoFrame: 'readonly',
    AudioEncoder: 'readonly',
    AudioData: 'readonly',
    MediaStreamTrackProcessor: 'readonly'
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'react/prop-types': 'off'
  }
}
