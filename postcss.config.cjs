// Renaming to .cjs forces CommonJS compatibility, which works reliably with PostCSS plugins.
module.exports = {
  plugins: {
    // This is the correct way to reference the Tailwind plugin in modern configurations.
    '@tailwindcss/postcss': {},
    'autoprefixer': {},
  }
}